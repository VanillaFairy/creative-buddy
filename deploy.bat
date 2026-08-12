@echo off
setlocal

rem ---------------------------------------------------------------------------
rem  Creative Buddy - copy the built plugin into an Obsidian vault.
rem
rem    deploy.bat                  deploy to the default vault below
rem    deploy.bat "D:\Vault\..."   deploy somewhere else
rem    set CB_PLUGIN_DIR=...       change the default without editing this file
rem
rem  Overwrites whatever is already in the target. Only the three files
rem  Obsidian loads are copied - data.json is the plugin's own settings, lives
rem  in the vault, and must never be clobbered from here.
rem ---------------------------------------------------------------------------

set "DEFAULT_TARGET=g:\My Drive\Obsidian\General\.obsidian\plugins\creative-buddy"
set "FILES=main.js manifest.json styles.css"

set "TARGET=%~1"
if not defined TARGET set "TARGET=%CB_PLUGIN_DIR%"
if not defined TARGET set "TARGET=%DEFAULT_TARGET%"

rem %~dp0 is this script's own folder, and already ends in a backslash.
set "SOURCE=%~dp0"

echo Creative Buddy deploy
echo   from  %SOURCE%
echo   to    %TARGET%
echo.

rem Check everything exists before copying anything, so a missing build cannot
rem leave the vault holding half of one version and half of another.
for %%F in (%FILES%) do (
  if not exist "%SOURCE%%%F" (
    echo ERROR: %%F is missing from the repo root.
    echo        Run "npm run build" first, then run this again.
    exit /b 1
  )
)

if not exist "%TARGET%\" (
  mkdir "%TARGET%" 2>nul
  if errorlevel 1 (
    echo ERROR: could not create "%TARGET%".
    echo        Check the drive is mounted and the path is right.
    exit /b 1
  )
  echo Created the plugin folder.
)

set "FAILED="
for %%F in (%FILES%) do (
  copy /Y "%SOURCE%%%F" "%TARGET%\" >nul
  if errorlevel 1 (
    echo   FAILED  %%F
    set "FAILED=1"
  ) else (
    echo   copied  %%F
  )
)

if defined FAILED (
  echo.
  echo Deploy incomplete - nothing else was changed.
  echo If Obsidian is open it can hold main.js while the plugin is enabled;
  echo disable Creative Buddy or close Obsidian, then run this again.
  exit /b 1
)

rem Print what actually landed. The timestamp is the point: a stale main.js is
rem the failure mode this script exists to make visible.
echo.
echo Now in the vault:
for %%F in (%FILES%) do (
  for %%D in ("%TARGET%\%%F") do echo   %%~tD   %%~zD bytes   %%~nxD
)

echo.
echo Reload the plugin to pick this up: Settings ^> Community plugins,
echo toggle Creative Buddy off and on.
exit /b 0
