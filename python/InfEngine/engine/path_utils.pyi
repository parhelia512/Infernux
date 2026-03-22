"""Path utilities for cross-language (Python ↔ C++) path safety.

On Windows, non-ASCII paths can break the narrow ``std::string`` interface.
:func:`safe_path` converts to an 8.3 short-path when possible.
"""

from __future__ import annotations


def safe_path(path: str) -> str:
    """Return an ASCII-safe version of *path* for consumption by C++.

    On non-Windows, or when the path is already ASCII-clean, returns
    *path* unchanged.  On Windows, uses ``GetShortPathNameW`` to obtain
    the 8.3 short-name form.

    Args:
        path: Filesystem path that may contain non-ASCII characters.
    """
    ...
