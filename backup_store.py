"""Consistent local backups plus an explicitly configured secondary folder."""
import os
import shutil
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime
from threading import Lock
from flask import g, jsonify, request
import api

_lock = Lock()


def directory():
    with closing(api._conn()) as con:
        row=con.execute('SELECT directory FROM backup_config WHERE id=1').fetchone()
        return row[0] if row else ''


def validate_directory(raw):
    if not isinstance(raw,str):
        raise ValueError('مسار النسخة الإضافية غير صحيح')
    if not raw.strip():
        return ''
    if not os.path.isabs(raw):
        raise ValueError('اكتب المسار الكامل لمجلد موجود على الهارد الخارجي أو الشبكة')
    target=os.path.realpath(raw.strip())
    if not os.path.isdir(target) or target==os.path.dirname(target):
        raise ValueError('اختر مجلدًا موجودًا؛ لا تختَر جذر القرص')
    for excluded in (os.path.dirname(os.path.realpath(api.DB_PATH)),os.path.realpath(api.BACKUP_DIR)):
        try:
            if os.path.commonpath([target,excluded])==excluded:
                raise ValueError('اختر مكانًا خارج مجلد المشروع والنسخ المحلية')
        except ValueError as exc:
            if 'اختر' in str(exc):raise
    return target


def run_backup(user_id='system'):
    with _lock:
        filename='pharmacy_'+datetime.now().strftime('%Y%m%d_%H%M%S_%f')+'_'+uuid.uuid4().hex[:6]+'.db'
        os.makedirs(api.BACKUP_DIR,exist_ok=True)
        local_path=os.path.join(api.BACKUP_DIR,filename)
        # Finish the snapshot before copying it; never copy an active WAL database.
        with closing(sqlite3.connect(api.DB_PATH)) as source, closing(sqlite3.connect(local_path)) as target:
            source.backup(target)
            if target.execute('PRAGMA quick_check').fetchone()[0]!='ok':
                raise ValueError('فشل التحقق من سلامة النسخة المحلية')
        secondary=directory();copied='';error=''
        if secondary:
            partial=''
            try:
                validate_directory(secondary)
                copied=os.path.join(secondary,filename)
                partial=copied+'.partial'
                shutil.copy2(local_path,partial)
                with closing(sqlite3.connect(partial)) as test:
                    if test.execute('PRAGMA quick_check').fetchone()[0]!='ok':
                        raise ValueError('فشل التحقق من النسخة الإضافية')
                os.replace(partial,copied)
            except (OSError,sqlite3.Error,ValueError) as exc:
                error=str(exc);copied=''
                # Only remove the unfinished file created by this specific run.
                if partial and os.path.isfile(partial):
                    try: os.unlink(partial)
                    except OSError: pass
        with closing(api._conn()) as con:
            con.execute('INSERT INTO backup_runs VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,datetime.now().isoformat(),local_path,copied,error,user_id))
            api._audit(con,user_id,'BACKUP','database',filename,'المحلية سليمة؛ '+('الإضافية سليمة' if copied else 'فشل النسخ الإضافي' if error else 'لم يُحدد مكان إضافي'))
            con.commit()
        return {'path':local_path,'filename':filename,'secondary_path':copied,'secondary_error':error,'secondary_configured':bool(secondary)}


def status():
    target=directory()
    with closing(api._conn()) as con:
        latest=con.execute('SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 1').fetchone()
        successes=con.execute("SELECT created_at,secondary_path FROM backup_runs WHERE secondary_path!='' ORDER BY created_at DESC").fetchall()
    success=next((row for row in successes if os.path.normcase(os.path.dirname(row['secondary_path']))==os.path.normcase(target)),None)
    configured=bool(target)
    stale=not success or (datetime.now()-datetime.fromisoformat(success[0])).total_seconds()>=3*86400
    return {'configured':configured,'last_success':success[0] if success else None,
            'state':'not_configured' if not configured else 'failed' if latest and latest['secondary_error'] else 'stale' if stale else 'ok',
            'error':latest['secondary_error'] if configured and latest else ''}


def register_routes(app):
    @app.route('/api/secondary_backup',methods=['GET','POST'])
    def secondary_backup():
        from pharmacy_ops import permission
        with closing(api._conn()) as con:
            if not permission(con,'all'):
                return jsonify(ok=False,error='إعداد النسخ الاحتياطي لمدير النظام فقط'),403
            if request.method=='POST':
                try:
                    target=validate_directory(request.get_json().get('directory',''))
                    con.execute('INSERT INTO backup_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET directory=excluded.directory',(target,))
                    api._audit(con,g.user_id,'CONFIGURE_BACKUP','database','secondary','تفعيل مكان إضافي' if target else 'إيقاف النسخة الإضافية')
                    con.commit()
                except ValueError as exc:
                    return jsonify(ok=False,error=str(exc)),400
        return jsonify(ok=True,data={'directory':directory(),**status()})
