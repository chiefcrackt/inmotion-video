@echo off
cd /d "%~dp0.."
if not exist ".venv-transcribe\Scripts\python.exe" (
  py -3.12 -m venv .venv-transcribe
  if errorlevel 1 goto done
)
".venv-transcribe\Scripts\python.exe" -m pip install -r local-transcriber\requirements-gpu.txt
echo Restart Transcribe Video after installation.
:done
pause
