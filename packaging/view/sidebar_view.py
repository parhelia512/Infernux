"""Left sidebar navigation for Infernux Hub (Unity Hub style)."""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QLabel,
    QApplication, QGraphicsOpacityEffect,
)
from PySide6.QtCore import Signal, Qt, QPropertyAnimation, Property, QEasingCurve
from PySide6.QtGui import QPainter, QColor, QBrush, QPaintEvent

from style import StyleManager
from i18n import tr


class ToggleSwitch(QWidget):
    """Animated toggle switch (used for dark-mode toggle)."""
    stateChanged = Signal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(44, 24)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._checked = True
        self._position = 23.0
        self._anim = QPropertyAnimation(self, b"position")
        self._anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self._anim.setDuration(200)

    @Property(float)
    def position(self):
        return self._position

    @position.setter
    def position(self, pos):
        self._position = pos
        self.update()

    def isChecked(self):
        return self._checked

    def setChecked(self, checked: bool):
        self._checked = checked
        self._position = 23.0 if checked else 3.0
        self.update()

    def mousePressEvent(self, ev):
        self._checked = not self._checked
        self._anim.stop()
        self._anim.setEndValue(23.0 if self._checked else 3.0)
        self._anim.start()
        self.stateChanged.emit(int(self._checked))

    def paintEvent(self, e: QPaintEvent):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)

        app = QApplication.instance()
        is_dark = getattr(app, "is_dark_theme", True)

        if self._checked:
            bg_color = QColor("#6877ff") if is_dark else QColor("#5865f2")
            thumb_color = QColor("#ffffff")
        else:
            bg_color = QColor("#555555") if is_dark else QColor("#e9e9e7")
            thumb_color = QColor("#cfcfcf") if is_dark else QColor("#ffffff")

        p.setBrush(QBrush(bg_color))
        p.drawRoundedRect(0, 0, self.width(), self.height(), 12, 12)

        p.setBrush(QBrush(thumb_color))
        p.drawEllipse(int(self._position), 3, 18, 18)
        p.end()


class SidebarView(QWidget):
    """Unity Hub-style left sidebar with page navigation."""

    page_changed = Signal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(232)
        self.setObjectName("sidebar")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── Title ────────────────────────────────────────────────────
        title_container = QWidget()
        title_container.setObjectName("sidebarHeader")
        title_layout = QVBoxLayout(title_container)
        title_layout.setContentsMargins(20, 24, 20, 20)
        title_layout.setSpacing(2)

        title = QLabel("Infernux")
        title.setObjectName("sidebarTitle")
        title_layout.addWidget(title)

        subtitle = QLabel(tr("Hub"))
        subtitle.setObjectName("sidebarSubtitle")
        title_layout.addWidget(subtitle)

        layout.addWidget(title_container)

        # ── Navigation ───────────────────────────────────────────────
        self._nav_buttons: list[QPushButton] = []

        for label, index in [(tr("Projects"), 0), (tr("Installs"), 1), (tr("Settings"), 2)]:
            btn = QPushButton(label)
            btn.setObjectName("navItem")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setFixedHeight(46)
            btn.setProperty("active", index == 0)
            btn.clicked.connect(lambda _checked, i=index: self._switch_page(i))
            layout.addWidget(btn)
            self._nav_buttons.append(btn)

        layout.addStretch()

        # ── Theme toggle at bottom ───────────────────────────────────
        theme_container = QWidget()
        theme_layout = QHBoxLayout(theme_container)
        theme_layout.setContentsMargins(20, 12, 20, 16)

        theme_label = QLabel(tr("Dark Mode"))
        theme_label.setObjectName("themeLabel")
        theme_layout.addWidget(theme_label)
        theme_layout.addStretch()

        self.theme_toggle = ToggleSwitch()
        self.theme_toggle.setChecked(True)
        self.theme_toggle.stateChanged.connect(self._toggle_theme)
        theme_layout.addWidget(self.theme_toggle)

        layout.addWidget(theme_container)

    # ── Internal ─────────────────────────────────────────────────────

    def _switch_page(self, index: int):
        for i, btn in enumerate(self._nav_buttons):
            btn.setProperty("active", i == index)
            btn.style().unpolish(btn)
            btn.style().polish(btn)
        self.page_changed.emit(index)

    def _toggle_theme(self, state):
        app = QApplication.instance()
        is_dark = bool(state)
        if getattr(app, "is_dark_theme", True) == is_dark:
            return

        window = self.window()
        # Grab + overlay for smooth transition
        pixmap = window.grab()
        overlay = QLabel(window)
        overlay.setPixmap(pixmap)
        overlay.setGeometry(window.rect())
        overlay.show()

        app.is_dark_theme = is_dark
        app.setStyleSheet(StyleManager.get_stylesheet(is_dark))
        app.processEvents()

        effect = QGraphicsOpacityEffect(overlay)
        overlay.setGraphicsEffect(effect)

        self._theme_anim = QPropertyAnimation(effect, b"opacity")
        self._theme_anim.setDuration(300)
        self._theme_anim.setStartValue(1.0)
        self._theme_anim.setEndValue(0.0)
        self._theme_anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self._theme_anim.finished.connect(overlay.deleteLater)
        self._theme_anim.start()
