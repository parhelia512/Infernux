"""GameBuilder — compile an InfEngine project into a standalone executable.

Orchestrates Nuitka compilation, asset copying, splash processing,
build manifest generation, and final cleanup.

Example::

    builder = GameBuilder(
        project_path="/path/to/project",
        output_dir="/path/to/output",
        on_progress=lambda msg, pct: print(f"{msg} ({pct*100:.0f}%)"),
    )
    builder.build()
"""

from __future__ import annotations

from typing import Callable, List, Optional


class GameBuilder:
    """Compile a project into a standalone player executable."""

    def __init__(
        self,
        project_path: str,
        output_dir: str,
        on_progress: Optional[Callable[[str, float], None]] = None,
        icon_path: Optional[str] = None,
        company_name: str = ...,
        product_name: str = ...,
        product_version: str = ...,
    ) -> None: ...

    def build(self) -> str:
        """Run the full build pipeline.

        Returns:
            Path to the final output directory containing the built executable.

        Raises:
            RuntimeError: If validation, compilation, or packaging fails.
        """
        ...
