@echo off
cd /d "%~dp0.."
if not exist ".venv-transcribe\Scripts\python.exe" (
  py -3.12 -m venv .venv-transcribe
  if errorlevel 1 goto failed
)
".venv-transcribe\Scripts\python.exe" -c "import faster_whisper, av; assert faster_whisper.__version__ == '1.2.1' and av.__version__ == '16.0.1'" >nul 2>&1
if errorlevel 1 (
  ".venv-transcribe\Scripts\python.exe" -m pip install -r local-transcriber\requirements.txt
  if errorlevel 1 goto failed
)
".venv-transcribe\Scripts\python.exe" local-transcriber\server.py
if errorlevel 1 goto failed
exit /b
:failed
echo Transcribe Video could not start. See the error above.
pause
