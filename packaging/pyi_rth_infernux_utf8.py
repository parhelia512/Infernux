# PyInstaller runtime hook — set UTF-8 before importing the Hub (Windows).
# -*- coding: utf-8 -*-
import os
import sys

if sys.platform == "win32":
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
