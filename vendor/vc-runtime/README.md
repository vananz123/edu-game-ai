# App-local Microsoft Visual C++ runtime

The official `llama-b*-bin-win-cpu-x64.zip` from llama.cpp imports
`MSVCP140.dll`, `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` but does not include
them. On a Windows machine with a missing or outdated Visual C++ 2015–2022
redistributable, `llama-server.exe` can exit with `0xC0000005`
(`3221225477`) before printing a useful log line.

These three DLLs are copied from the Microsoft Visual C++ 2015–2022
Redistributable (x64), version **14.50.35719.0**, and are packaged as
`extraResources/vc-runtime` so `LlamaRuntimeInstaller` can place them next to
`llama-server.exe`. They are Microsoft redistributable files, not part of the
MIT-licensed EduGame Studio source. See:

- https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist
- https://learn.microsoft.com/visualstudio/releases/2022/redistribution

Keep this directory in sync with the runtime DLLs the shipped llama.cpp build
imports. The file list is declared in `src/ai-core/runtime-installer.ts`
(`RUNTIME_SUPPORT_FILES`).
