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

        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        header.setSpacing(16)

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

        actions = QHBoxLayout()
        actions.setContentsMargins(0, 0, 0, 0)
        actions.setSpacing(8)
        self.btn_open = QPushButton(tr("Open"))
        self.btn_open.setObjectName("normalBtn")
        self.btn_open.setFixedHeight(38)
        self.btn_open.setMinimumWidth(88)
        self.btn_open.clicked.connect(lambda: self.viewmodel.open_existing_project(self))
        actions.addWidget(self.btn_open)

        self.btn_new = QPushButton(tr("New"))
        self.btn_new.setObjectName("primaryBtn")
        self.btn_new.setFixedHeight(38)
        self.btn_new.setMinimumWidth(88)
        self.btn_new.clicked.connect(lambda: self.viewmodel.create_project(self))
        actions.addWidget(self.btn_new)

        self.btn_launch = QPushButton(tr("Launch"))
        self.btn_launch.setObjectName("normalBtn")
        self.btn_launch.setFixedHeight(38)
        self.btn_launch.setMinimumWidth(88)
        self.btn_launch.clicked.connect(lambda: self.viewmodel.launch_project(self))
        actions.addWidget(self.btn_launch)

        header.addLayout(actions)
        main_layout.addLayout(header)
