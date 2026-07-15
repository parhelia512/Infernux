"""Early Hub settings page."""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QComboBox, QFrame, QHBoxLayout, QLabel, QMessageBox, QVBoxLayout, QWidget

from i18n import current_language, detect_system_locale, tr


class SettingsView(QWidget):
    def __init__(self, db, parent=None):
        super().__init__(parent)
        self._db = db

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(18)

        title = QLabel(tr("Settings"))
        title.setObjectName("pageTitle")
        layout.addWidget(title)

        subtitle = QLabel(tr("System language is detected automatically on Windows."))
        subtitle.setObjectName("pageSubtitle")
        layout.addWidget(subtitle)

        card = QFrame()
        card.setObjectName("settingsCard")
        card.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 18, 20, 18)
        card_layout.setSpacing(12)

        row = QHBoxLayout()
        label_block = QVBoxLayout()
        language_label = QLabel(tr("Language"))
        language_label.setObjectName("settingsLabel")
        label_block.addWidget(language_label)
        detected = QLabel(
            f"{tr('Current language')}: {'中文' if current_language() == 'zh' else 'English'} "
            f"({detect_system_locale()})"
        )
        detected.setObjectName("settingsDescription")
        label_block.addWidget(detected)
        row.addLayout(label_block, 1)

        self.language_combo = QComboBox()
        self.language_combo.addItem(tr("System"), "system")
        self.language_combo.addItem(tr("Chinese"), "zh")
        self.language_combo.addItem(tr("English"), "en")
        saved = self._db.get_setting("language", "system") if self._db else "system"
        index = self.language_combo.findData(saved)
        self.language_combo.setCurrentIndex(max(index, 0))
        self.language_combo.currentIndexChanged.connect(self._save_language)
        row.addWidget(self.language_combo)
        card_layout.addLayout(row)

        hint = QLabel(tr("Language changes apply after restarting Infernux Hub."))
        hint.setObjectName("settingsDescription")
        card_layout.addWidget(hint)
        layout.addWidget(card)
        layout.addStretch()

    def _save_language(self):
        if not self._db:
            return
        mode = self.language_combo.currentData()
        if mode == self._db.get_setting("language", "system"):
            return
        self._db.set_setting("language", mode)
        QMessageBox.information(
            self,
            tr("Restart Required"),
            tr("The language preference was saved. Restart Infernux Hub to apply it everywhere."),
        )


__all__ = ["SettingsView"]
