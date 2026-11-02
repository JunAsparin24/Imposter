@echo off
title IMPOSTER Christmas Edition
rem Double-click this to start IMPOSTER and open the game.
rem Keep the black window open during the game; close it to stop.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-imposter.ps1"
pause
