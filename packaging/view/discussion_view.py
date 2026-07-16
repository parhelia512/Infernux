"""Early community entry page for the Infernux Hub."""

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget
from PySide6.QtGui import QDesktopServices
from PySide6.QtCore import QUrl

from i18n import tr
from view.hover_widgets import AnimatedSurfaceFrame


class DiscussionGlyph(QWidget):
    """A small native-drawn mark, keeping the community page asset-free."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(72, 72)

    def paintEvent(self, _event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#eb5757"))
        painter.drawRect(4, 6, 8, 60)
        painter.drawRect(20, 6, 48, 8)
        painter.drawRect(20, 32, 34, 8)
        painter.drawRect(20, 58, 48, 8)
        painter.drawRect(60, 18, 8, 36)
        painter.end()


class DiscussionView(QWidget):
    """A quiet landing page before opening the external beta forum."""

    FORUM_URL = "https://www.infernux-engine.com"

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 30, 32, 30)
        layout.setSpacing(18)

        title = QLabel(tr("Discussion"))
        title.setObjectName("pageTitle")
        layout.addWidget(title)

        subtitle = QLabel(tr("A place for early Infernux engine conversations and feedback."))
        subtitle.setObjectName("pageSubtitle")
        layout.addWidget(subtitle)

        hero = AnimatedSurfaceFrame("discussionHero")
        hero.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(30, 30, 30, 30)
        hero_layout.setSpacing(26)
        hero_layout.addWidget(DiscussionGlyph(), 0, Qt.AlignmentFlag.AlignTop)

        copy = QVBoxLayout()
        copy.setSpacing(8)
        eyebrow = QLabel(tr("INFERNUX COMMUNITY // BETA"))
        eyebrow.setObjectName("discussionEyebrow")
        copy.addWidget(eyebrow)
        heading = QLabel(tr("The discussion area is in beta."))
        heading.setObjectName("discussionHeading")
        copy.addWidget(heading)
        description = QLabel(tr(
            "Share feedback, workflow ideas and early project experiments with other Infernux users."
        ))
        description.setObjectName("discussionDescription")
        description.setWordWrap(True)
        copy.addWidget(description)
        address = QLabel("www.infernux-engine.com")
        address.setObjectName("discussionAddress")
        copy.addWidget(address)
        copy.addSpacing(8)
        enter = QPushButton(tr("Enter Discussion"))
        enter.setObjectName("primaryBtn")
        enter.setCursor(Qt.CursorShape.PointingHandCursor)
        enter.setFixedHeight(38)
        enter.clicked.connect(self._open_forum)
        copy.addWidget(enter, 0, Qt.AlignmentFlag.AlignLeft)
        hero_layout.addLayout(copy, 1)
        layout.addWidget(hero)
        layout.addStretch()

    @classmethod
    def _open_forum(cls):
        QDesktopServices.openUrl(QUrl(cls.FORUM_URL))


__all__ = ["DiscussionView"]
