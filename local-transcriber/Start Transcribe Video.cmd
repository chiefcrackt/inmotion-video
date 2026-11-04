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
rem Runs in the background with no window: the page has a Stop button.
start "" ".venv-transcribe\Scripts\pythonw.exe" local-transcriber\server.py
powershell -NoProfile -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest http://127.0.0.1:8765/app.js -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 goto failed
exit /b
:failed
echo Transcribe Video could not start. See the error above, or the end of its log:
if exist "local-transcriber\data\server.log" powershell -NoProfile -Command "Get-Content local-transcriber\data\server.log -Tail 15"
pause
