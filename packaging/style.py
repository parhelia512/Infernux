"""Centralized product theme for Infernux Hub."""

class StyleManager:
    """Provides dynamic QSS stylesheets for light/dark modes."""

    @staticmethod
    def get_stylesheet(is_dark: bool) -> str:
        if is_dark:
            bg_base = "#0d0f14"
            bg_surface = "#161923"
            bg_surface_hover = "#1d2230"
            bg_surface_selected = "#242b3b"
            bg_input = "#12151d"
            text_primary = "#f2f4f8"
            text_secondary = "#a7b0c2"
            text_muted = "#6f7a90"
            border = "#282f3d"
            accent = "#6877ff"
            accent_hover = "#7d89ff"
            accent_text = "#ffffff"
            danger = "#ff647c"
            sidebar_bg = "#090b10"
            sidebar_border = "#1e2430"
            nav_hover = "#121620"
            nav_active = "#191e2a"
            nav_indicator = accent
        else:
            bg_base = "#f5f7fb"
            bg_surface = "#ffffff"
            bg_surface_hover = "#f0f3f9"
            bg_surface_selected = "#e8ecf8"
            bg_input = "#ffffff"
            text_primary = "#151a25"
            text_secondary = "#59657a"
            text_muted = "#8a95a8"
            border = "#dce2ec"
            accent = "#5865f2"
            accent_hover = "#4855df"
            accent_text = "#ffffff"
            danger = "#e54861"
            sidebar_bg = "#edf1f7"
            sidebar_border = "#d9e0eb"
            nav_hover = "#e5eaf3"
            nav_active = "#dce3f0"
            nav_indicator = accent

        return f"""
            * {{
                font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
                color: {text_primary};
            }}
            QMainWindow, QWidget#central, QDialog {{
                background-color: {bg_base};
            }}
            QToolTip {{
                background-color: {bg_surface};
                color: {text_primary};
                border: 1px solid {border};
                padding: 4px 8px;
                border-radius: 7px;
            }}

            /* ── Sidebar ── */
            QWidget#sidebar {{
                background-color: {sidebar_bg};
                border-right: 1px solid {sidebar_border};
            }}
            QWidget#sidebarHeader {{
                background: transparent;
            }}
            QLabel#sidebarTitle {{
                font-size: 23px;
                font-weight: 650;
                color: {text_primary};
            }}
            QLabel#sidebarSubtitle {{
                font-size: 13px;
                font-weight: 400;
                color: {text_muted};
            }}
            QPushButton#navItem {{
                background: transparent;
                border: none;
                border-left: 3px solid transparent;
                border-radius: 0;
                text-align: left;
                padding: 0 22px;
                font-size: 14px;
                font-weight: 500;
                color: {text_secondary};
            }}
            QPushButton#navItem:hover {{
                background-color: {nav_hover};
                color: {text_primary};
            }}
            QPushButton#navItem[active="true"] {{
                background-color: {nav_active};
                border-left: 3px solid {nav_indicator};
                color: {text_primary};
                font-weight: 600;
            }}

            /* ── ScrollBar ── */
            QScrollBar:vertical {{
                background: transparent;
                width: 8px;
                margin: 0;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical {{
                background: {border};
                min-height: 30px;
                border-radius: 4px;
            }}
            QScrollBar::handle:vertical:hover {{
                background: {text_muted};
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {{ background: none; }}
            QScrollArea {{ border: none; background: transparent; }}

            /* ── Buttons ── */
            QPushButton {{
                background-color: {bg_surface};
                color: {text_primary};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 7px 16px;
                font-size: 13px;
                font-weight: 550;
            }}
            QPushButton:hover {{
                background-color: {bg_surface_hover};
            }}
            QPushButton:pressed {{
                background-color: {bg_surface_selected};
            }}
            QPushButton#primaryBtn, QPushButton#createBtn {{
                background-color: {accent};
                color: {accent_text};
                border: none;
                font-weight: 600;
            }}
            QPushButton#primaryBtn:hover, QPushButton#createBtn:hover {{
                background-color: {accent_hover};
            }}
            QPushButton#dangerBtn {{
                color: {danger};
                border: 1px solid {danger};
                background: transparent;
            }}
            QPushButton#dangerBtn:hover {{
                background-color: {danger};
                color: #ffffff;
            }}
            QPushButton#iconBtn {{
                background: transparent;
                border: none;
                font-size: 18px;
                padding: 4px;
            }}
            QPushButton#iconBtn:hover {{
                background: {bg_surface_hover};
            }}

            /* ── Theme Label ── */
            QLabel#themeLabel {{
                font-size: 14px;
                color: {text_secondary};
            }}

            /* ── Inputs ── */
            QLineEdit {{
                background-color: {bg_input};
                color: {text_primary};
                border: 1px solid {border};
                border-radius: 9px;
                padding: 9px 13px;
                font-size: 14px;
            }}
            QLineEdit:focus {{
                border-color: {accent};
                background-color: {bg_surface};
            }}
            QLineEdit::placeholder {{
                color: {text_muted};
            }}

            /* ── ComboBox ── */
            QComboBox {{
                background-color: {bg_input};
                color: {text_primary};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 14px;
            }}
            QComboBox:hover {{
                border-color: {text_muted};
            }}
            QComboBox::drop-down {{
                border: none;
                width: 24px;
            }}
            QComboBox QAbstractItemView {{
                background-color: {bg_surface};
                color: {text_primary};
                border: 1px solid {border};
                selection-background-color: {bg_surface_selected};
            }}

            /* ── Project Card ── */
            QFrame#projectCard {{
                background-color: {bg_surface};
                border: 1px solid {border};
                border-radius: 12px;
            }}
            QFrame#projectCard:hover {{
                background-color: {bg_surface_hover};
            }}
            QFrame#projectCard[selected="true"] {{
                background-color: {bg_surface_selected};
                border: 2px solid {accent};
            }}
            QPushButton#cardAvatar {{
                background-color: {accent};
                color: {accent_text};
                border-radius: 10px;
                font-size: 16px;
                font-weight: bold;
                border: 1px solid {accent};
                padding: 0;
                margin: 0;
            }}
            QLabel#cardName {{
                font-size: 15px;
                font-weight: 600;
            }}
            QLabel#cardPath {{
                font-size: 12px;
                color: {text_secondary};
            }}
            QLabel#cardVersion {{
                font-size: 11px;
                color: {text_muted};
            }}
            QLabel#cardDate {{
                font-size: 12px;
                color: {text_muted};
            }}
            QPushButton#cardOpenBtn {{
                background: transparent;
                color: {text_secondary};
                border: 1px solid {border};
                border-radius: 6px;
                font-size: 16px;
                padding: 0;
            }}
            QPushButton#cardOpenBtn:hover {{
                background: {bg_surface_hover};
                color: {text_primary};
            }}
            QLabel#projectStatus {{
                padding: 4px 9px;
                border-radius: 9px;
                font-size: 11px;
                font-weight: 600;
                color: {text_secondary};
                background-color: {bg_surface_selected};
            }}
            QLabel#projectStatus[kind="ready"] {{ color: #68d391; background-color: rgba(44, 122, 83, 0.25); }}
            QLabel#projectStatus[kind="warning"] {{ color: #f6c85f; background-color: rgba(154, 107, 19, 0.24); }}
            QLabel#projectStatus[kind="error"] {{ color: {danger}; background-color: rgba(160, 42, 62, 0.22); }}
            QLabel#projectStatus[kind="active"] {{ color: #7dd3fc; background-color: rgba(21, 94, 117, 0.28); }}

            /* ── Version Card (Installs page) ── */
            QFrame#versionCard {{
                background-color: {bg_surface};
                border: 1px solid {border};
                border-radius: 12px;
            }}
            QFrame#versionCard:hover {{
                background-color: {bg_surface_hover};
            }}
            QLabel#versionBadge {{
                font-size: 16px;
                font-weight: 700;
                color: {text_primary};
                padding: 2px 10px;
                background-color: {bg_surface_selected};
                border-radius: 4px;
            }}

            /* ── Version Row (Install Editor dialog) ── */
            QFrame#versionRow {{
                background-color: {bg_surface};
                border: 1px solid transparent;
                border-radius: 6px;
            }}
            QFrame#versionRow:hover {{
                background-color: {bg_surface_hover};
            }}
            QFrame#versionRow[selected="true"] {{
                background-color: {bg_surface_selected};
                border: 1px solid {accent};
            }}
            QLabel#installedBadge {{
                font-size: 12px;
                color: {text_muted};
                font-style: italic;
            }}

            /* ── Page Title ── */
            QLabel#pageTitle {{
                font-size: 27px;
                font-weight: 650;
            }}
            QLabel#pageSubtitle {{
                font-size: 13px;
                color: {text_secondary};
            }}

            /* ── Empty hint ── */
            QLabel#emptyHint {{
                font-size: 14px;
                color: {text_muted};
                padding: 4px;
            }}
            QFrame#emptyState {{
                background-color: {bg_surface};
                border: 1px dashed {border};
                border-radius: 14px;
                min-height: 210px;
            }}
            QLabel#emptyTitle {{
                font-size: 18px;
                font-weight: 600;
            }}
            QFrame#settingsCard {{
                background-color: {bg_surface};
                border: 1px solid {border};
                border-radius: 12px;
            }}
            QLabel#settingsLabel {{
                font-size: 15px;
                font-weight: 600;
            }}
            QLabel#settingsDescription {{
                font-size: 12px;
                color: {text_secondary};
            }}

            /* ── Header (legacy) ── */
            QLabel#mainTitle {{
                font-size: 28px;
                font-weight: 700;
            }}
            QLabel#subTitle {{
                font-size: 14px;
                color: {text_muted};
            }}

            /* ── Progress ── */
            QProgressBar {{
                background-color: {bg_surface};
                border: 1px solid {border};
                border-radius: 4px;
                height: 6px;
            }}
            QProgressBar::chunk {{
                background-color: {accent};
                border-radius: 3px;
            }}
        """
