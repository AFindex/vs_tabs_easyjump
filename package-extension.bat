@echo off
setlocal enabledelayedexpansion

pushd %~dp0

chcp 65001 >nul

echo [INFO] 正在检查 Node.js 环境...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js。请先安装 Node.js 并确保其在 PATH 中。
  exit /b 1
)

echo [INFO] 正在检查 npm...
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 npm。请确认 Node.js 安装完整并在 PATH 中。
  exit /b 1
)

echo [INFO] 当前 Node.js 版本：
node -v

echo [INFO] 当前 npm 版本：
call npm -v

echo [STEP] 安装项目依赖...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install 失败，请检查网络或 package.json 配置。
  exit /b 1
)

echo [STEP] 编译 TypeScript...
call npm run compile
if errorlevel 1 (
  echo [ERROR] TypeScript 编译失败，请检查编译输出。
  exit /b 1
)

echo [STEP] 打包 VS Code 扩展...
call npx --yes @vscode/vsce package
if errorlevel 1 (
  echo [ERROR] 扩展打包失败，请检查上方输出信息。
  exit /b 1
)

echo [SUCCESS] 扩展打包完成，输出文件位于：
for %%F in ("%~dp0*.vsix") do echo    %%~nxF

popd
exit /b 0

