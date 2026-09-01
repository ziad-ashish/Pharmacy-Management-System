@echo off
chcp 65001 > nul
title صيدلية الشفاء

echo.
echo  ╔══════════════════════════════════════╗
echo  ║    صيدلية الشفاء - نظام الإدارة      ║
echo  ╚══════════════════════════════════════╝
echo.

set "PYTHON_CMD=python"
python --version > nul 2>&1
if errorlevel 1 set "PYTHON_CMD=py"
%PYTHON_CMD% --version > nul 2>&1
if errorlevel 1 (
    echo  [خطأ] Python غير مثبت أو غير مضاف إلى PATH.
    pause & exit /b 1
)

%PYTHON_CMD% -c "import flask, webview" > nul 2>&1
if errorlevel 1 (
    echo  [تثبيت] جارٍ تثبيت المتطلبات...
    %PYTHON_CMD% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo  [خطأ] فشل تثبيت المتطلبات.
        pause & exit /b 1
    )
)

echo  [تشغيل] يتم فتح التطبيق...
echo.
%PYTHON_CMD% main.py

pause
