@echo off
cd /d "%~dp0.."
if not exist ".venv-clean-voice\Scripts\python.exe" (
  py -3.12 -m venv .venv-clean-voice
  if errorlevel 1 goto failed
)
".venv-clean-voice\Scripts\python.exe" local-voice\check_install.py >nul 2>&1
if errorlevel 1 (
  echo Installing Clean Voice's engines. The first time takes a few minutes.
  ".venv-clean-voice\Scripts\python.exe" -m pip install -r local-voice\requirements.txt
  if errorlevel 1 goto failed
)
".venv-clean-voice\Scripts\python.exe" local-voice\server.py
if errorlevel 1 goto failed
exit /b
:failed
echo Clean Voice could not start. See the error above.
pause
