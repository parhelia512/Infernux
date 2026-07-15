"""Header bar for the Projects page."""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
)
from PySide6.QtCore import Qt
from i18n import tr


class ControlPane(QWidget):
    """Projects page header with title + action buttons."""

    def __init__(self, viewmodel, style=None, parent=None):
        super().__init__(parent)
        self.viewmodel = viewmodel

        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(16)
        main_layout.setContentsMargins(0, 0, 0, 0)

        # ── Header row ──
        header = QHBoxLayout()
        header.setContentsMargins(2, 0, 0, 0)

        title_block = QVBoxLayout()
        title_block.setSpacing(2)
        title = QLabel(tr("Projects"))
        title.setObjectName("pageTitle")
        title_block.addWidget(title)
        subtitle = QLabel(tr("Create, open and launch your Infernux projects."))
        subtitle.setObjectName("pageSubtitle")
        title_block.addWidget(subtitle)
        header.addLayout(title_block)
        header.addStretch()
        main_layout.addLayout(header)

        actions = QHBoxLayout()
        actions.setContentsMargins(0, 0, 0, 0)
        actions.setSpacing(8)

        # ── Action buttons (right-aligned) ──
        self.btn_remove = QPushButton(tr("Remove"))
        self.btn_remove.setObjectName("normalBtn")
        self.btn_remove.setFixedHeight(38)
        self.btn_remove.setMinimumWidth(90)
        self.btn_remove.setToolTip(tr("Remove the selected project from Hub without deleting its files"))
        self.btn_remove.clicked.connect(lambda: self.viewmodel.remove_project(self))
        actions.addWidget(self.btn_remove)

        self.btn_relocate = QPushButton(tr("Relocate"))
        self.btn_relocate.setObjectName("normalBtn")
        self.btn_relocate.setFixedHeight(38)
        self.btn_relocate.setMinimumWidth(90)
        self.btn_relocate.setToolTip(tr("Update the location of the selected project"))
        self.btn_relocate.clicked.connect(lambda: self.viewmodel.relocate_project(self))
        actions.addWidget(self.btn_relocate)

        self.btn_migrate = QPushButton(tr("Migrate"))
        self.btn_migrate.setObjectName("normalBtn")
        self.btn_migrate.setFixedHeight(38)
        self.btn_migrate.setMinimumWidth(90)
        self.btn_migrate.setToolTip(tr("Migrate the selected project to another installed engine version"))
        self.btn_migrate.clicked.connect(lambda: self.viewmodel.migrate_project(self))
        actions.addWidget(self.btn_migrate)
        actions.addStretch()

        self.btn_new = QPushButton(tr("+ New Project"))
        self.btn_new.setObjectName("primaryBtn")
        self.btn_new.setFixedHeight(38)
        self.btn_new.setMinimumWidth(130)
        self.btn_new.clicked.connect(lambda: self.viewmodel.create_project(self))
        actions.addWidget(self.btn_new)

        self.btn_open = QPushButton(tr("Open Existing"))
        self.btn_open.setObjectName("normalBtn")
        self.btn_open.setFixedHeight(38)
        self.btn_open.setMinimumWidth(120)
        self.btn_open.clicked.connect(lambda: self.viewmodel.open_existing_project(self))
        actions.addWidget(self.btn_open)

        self.btn_launch = QPushButton("▶  " + tr("Launch"))
        self.btn_launch.setObjectName("normalBtn")
        self.btn_launch.setFixedHeight(38)
        self.btn_launch.setMinimumWidth(110)
        self.btn_launch.clicked.connect(lambda: self.viewmodel.launch_project(self))
        actions.addWidget(self.btn_launch)

        main_layout.addLayout(actions)
