@echo off
echo ========================================
echo CLEANING PYTHON CACHE...
echo ========================================

cd /d D:\laragon\www\MeterSquare\backend

REM Delete all __pycache__ directories
for /d /r %%i in (__pycache__) do @if exist "%%i" rd /s /q "%%i"

REM Delete all .pyc files
del /s /q *.pyc 2>nul

echo.
echo ========================================
echo CACHE CLEARED SUCCESSFULLY
echo ========================================
echo.
echo Python bytecode cache has been removed.
echo.
echo ========================================
echo NOW START THE BACKEND SERVER:
echo ========================================
echo.
echo Run this command in a new terminal:
echo    cd D:\laragon\www\MeterSquare\backend
echo    python app.py
echo.
echo After backend starts, test the PDF download.
echo.
pause
