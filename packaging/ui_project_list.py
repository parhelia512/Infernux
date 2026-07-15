"""Project list pane with search, modern Notion-themed cards, and folder-open."""

import os

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea,
    QSizePolicy, QFrame, QPushButton, QLineEdit
)
from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices

from database import ProjectDatabase
from hub_utils import is_project_open
from i18n import tr
from version_manager import VersionManager


class _ProjectCard(QFrame):
    """A single project card with initials avatar, name, date, path."""

    def __init__(self, project_id: str, name: str, created_at: str, path: str,
                 version_manager=None, parent=None):
        super().__init__(parent)
        self.setObjectName("projectCard")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        self.project_name = name
        self.project_id = project_id
        self.project_path = path
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(92)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(14)

        # --- Initials avatar ---
        initials = "".join(w[0] for w in name.split()[:2]).upper() or name[:2].upper()
        avatar = QPushButton(initials)
        avatar.setObjectName("cardAvatar")
        avatar.setFixedSize(44, 44)
        avatar.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        layout.addWidget(avatar)

        # --- Text block ---
        text_col = QVBoxLayout()
        text_col.setSpacing(2)
        text_col.setContentsMargins(0, 0, 0, 0)

        name_label = QLabel(name)
        name_label.setObjectName("cardName")
        text_col.addWidget(name_label)

        path_label = QLabel(path)
        path_label.setObjectName("cardPath")
        path_label.setToolTip(path)
        text_col.addWidget(path_label)

        version = VersionManager.read_project_version(path) if os.path.isdir(path) else ""
        if version:
            version_label = QLabel(f"Infernux {version}")
            version_label.setObjectName("cardVersion")
            text_col.addWidget(version_label)

        layout.addLayout(text_col, 1)

        if not os.path.isdir(path):
            status_text, status_kind = tr("Project path missing"), "error"
        elif is_project_open(path):
            status_text, status_kind = tr("Project Already Open"), "active"
        elif version and version_manager is not None and not version_manager.is_installed(version):
            status_text, status_kind = tr("Engine Version Not Installed"), "warning"
        else:
            status_text, status_kind = tr("Ready"), "ready"
        status_label = QLabel(status_text)
        status_label.setObjectName("projectStatus")
        status_label.setProperty("kind", status_kind)
        layout.addWidget(status_label, alignment=Qt.AlignmentFlag.AlignRight)

        # --- Open-folder button ---
        open_btn = QPushButton("⌂")
        open_btn.setObjectName("cardOpenBtn")
        open_btn.setFixedSize(32, 32)
        open_btn.setToolTip(tr("Open project folder"))
        open_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        open_btn.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(path)))
        layout.addWidget(open_btn)

    # --- Selection state ---
    def set_selected(self, selected: bool):
        self.setProperty("selected", selected)
        self.style().unpolish(self)
        self.style().polish(self)


class ProjectListPane(QWidget):
    """Scrollable list of project cards with a search bar."""

    def __init__(self, db: ProjectDatabase, version_manager=None, parent=None):
        super().__init__(parent)
        self.db = db
        self.version_manager = version_manager
        self.selected_project_id = None
        self.project_cards: dict[str, _ProjectCard] = {}
        self._all_projects = []

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setStyleSheet("background-color: transparent;")

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(10)

        # --- Search bar ---
        self.search_edit = QLineEdit()
        self.search_edit.setObjectName("searchBox")
        self.search_edit.setPlaceholderText(tr("Search projects..."))
        self.search_edit.setClearButtonEnabled(True)
        self.search_edit.setFixedHeight(36)
        self.search_edit.textChanged.connect(self._apply_filter)
        main_layout.addWidget(self.search_edit)

        # --- Scrollable card area ---
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        main_layout.addWidget(scroll_area)

        self.container = QWidget()
        self.container.setStyleSheet("background: transparent;")
        self.card_layout = QVBoxLayout(self.container)
        self.card_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.card_layout.setSpacing(6)
        self.card_layout.setContentsMargins(0, 0, 4, 0)
        scroll_area.setWidget(self.container)

        self.refresh()

    # ------------------------------------------------------------------
    def refresh(self):
        previous_selection = self.selected_project_id
        self.project_cards.clear()
        while self.card_layout.count():
            item = self.card_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

        self._all_projects = self.db.all_projects()
        for record in self._all_projects:
            card = _ProjectCard(
                record.project_id, record.name, record.created_at, record.path,
                self.version_manager,
            )
            card.mousePressEvent = lambda _ev, pid=record.project_id: self._on_select(pid)
            card.mouseDoubleClickEvent = lambda _ev, pid=record.project_id: self._on_double_click(pid)
            self.card_layout.addWidget(card)
            self.project_cards[record.project_id] = card

        if not self._all_projects:
            empty = QFrame()
            empty.setObjectName("emptyState")
            empty_layout = QVBoxLayout(empty)
            empty_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_title = QLabel(tr("No projects yet"))
            empty_title.setObjectName("emptyTitle")
            empty_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_detail = QLabel(tr("Create a new project or open an existing project to get started."))
            empty_detail.setObjectName("emptyHint")
            empty_detail.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(empty_title)
            empty_layout.addWidget(empty_detail)
            self.card_layout.addWidget(empty)
        self.card_layout.addStretch()
        self._apply_filter(self.search_edit.text())
        if previous_selection in self.project_cards:
            self._on_select(previous_selection)
        else:
            self.selected_project_id = None

    # ------------------------------------------------------------------
    def _apply_filter(self, text: str):
        needle = text.strip().lower()
        for card in self.project_cards.values():
            searchable = f"{card.project_name} {card.project_path}".lower()
            card.setVisible(needle in searchable if needle else True)

    def _on_select(self, project_id: str):
        self.selected_project_id = project_id
        for candidate_id, card in self.project_cards.items():
            card.set_selected(candidate_id == project_id)

    def _on_double_click(self, project_id: str):
        """Select + auto-launch on double-click (handled by parent)."""
        self._on_select(project_id)

    # ------------------------------------------------------------------
    # Public API (unchanged)
    # ------------------------------------------------------------------
    def get_selected_project(self):
        record = self.get_selected_record()
        return record.name if record else None

    def get_selected_project_id(self):
        return self.selected_project_id

    def get_selected_record(self):
        if self.selected_project_id:
            return self.db.get_project(self.selected_project_id)
        return None

    def get_selected_project_path(self):
        record = self.get_selected_record()
        return record.path if record else None

    def select_project(self, project_id: str):
        if project_id in self.project_cards:
            self._on_select(project_id)
