@echo off
cd /d "%~dp0.."
if not exist ".venv-clean-voice\Scripts\python.exe" (
  py -3.12 -m venv .venv-clean-voice
  if errorlevel 1 goto done
)
echo Downloading the NVIDIA (CUDA) build of PyTorch, about 2.5 GB.
".venv-clean-voice\Scripts\python.exe" -m pip install -r local-voice\requirements-gpu.txt
".venv-clean-voice\Scripts\python.exe" -c "import torch; print('GPU ready:', torch.cuda.get_device_name(0)) if torch.cuda.is_available() else print('PyTorch still cannot see an NVIDIA GPU. Update the NVIDIA driver and try again.')"
echo Restart Clean Voice after installation.
:done
pause
