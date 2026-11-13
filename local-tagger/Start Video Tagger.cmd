@echo off
rem Video Tagger: asks for a folder of videos, then transcribes, tags and describes each one.
rem It uses Transcribe Video's engine and Python environment (..\.venv-transcribe).
cd /d "%~dp0.."
if not exist ".venv-transcribe\Scripts\python.exe" (
  echo Video Tagger uses Transcribe Video's engine, which isn't set up yet.
  echo Run local-transcriber\Start Transcribe Video.cmd once, then try again.
  pause
  exit /b 1
)
".venv-transcribe\Scripts\python.exe" "local-tagger\video_tagger.py" %*
echo.
pause
