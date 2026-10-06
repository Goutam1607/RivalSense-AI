@echo off
cd /d "%~dp0"
echo Running evaluation... this can take a few minutes.
".venv\Scripts\python.exe" -m pipeline eval > eval\eval_log.txt 2>&1
echo EXIT CODE %ERRORLEVEL% >> eval\eval_log.txt
echo Done. You can close this window.
