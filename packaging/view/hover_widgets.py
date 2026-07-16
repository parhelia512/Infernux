"""Reusable, native Qt hover transitions for Infernux Hub surfaces and controls."""

from __future__ import annotations

from PySide6.QtCore import Property, QEasingCurve, QEvent, QObject, QPropertyAnimation, Qt, QVariantAnimation
from PySide6.QtGui import QColor, QLinearGradient, QPainter, QPen
from PySide6.QtWidgets import QApplication, QComboBox, QFrame, QLineEdit, QPushButton, QWidget


def _mix(start: QColor, end: QColor, amount: float) -> QColor:
    amount = max(0.0, min(1.0, amount))
    return QColor(
        round(start.red() + (end.red() - start.red()) * amount),
        round(start.green() + (end.green() - start.green()) * amount),
        round(start.blue() + (end.blue() - start.blue()) * amount),
        round(start.alpha() + (end.alpha() - start.alpha()) * amount),
    )


def _hex(color: QColor) -> str:
    return color.name(QColor.NameFormat.HexRgb)


def _is_dark() -> bool:
    return bool(getattr(QApplication.instance(), "is_dark_theme", True))


class AnimatedSurfaceFrame(QFrame):
    """Flat Hub surface with animated hover gradient and optional inner selection ring."""

    def __init__(self, object_name: str, parent=None):
        super().__init__(parent)
        self.setObjectName(object_name)
        self.setMouseTracking(True)
        self.setAttribute(Qt.WidgetAttribute.WA_Hover, True)
        self._hover_progress = 0.0
        self._selection_progress = 0.0
        self._hover_animation = QPropertyAnimation(self, b"hoverProgress", self)
        self._hover_animation.setDuration(170)
        self._hover_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._selection_animation = QPropertyAnimation(self, b"selectionProgress", self)
        self._selection_animation.setDuration(210)
        self._selection_animation.setEasingCurve(QEasingCurve.Type.OutCubic)

    @Property(float)
    def hoverProgress(self):
        return self._hover_progress

    @hoverProgress.setter
    def hoverProgress(self, value):
        self._hover_progress = float(value)
        self.update()

    @Property(float)
    def selectionProgress(self):
        return self._selection_progress

    @selectionProgress.setter
    def selectionProgress(self, value):
        self._selection_progress = float(value)
        self.update()

    def set_selected_animated(self, selected: bool):
        self._selection_animation.stop()
        self._selection_animation.setStartValue(self._selection_progress)
        self._selection_animation.setEndValue(1.0 if selected else 0.0)
        self._selection_animation.start()

    def enterEvent(self, event):
        self._animate_hover(1.0)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._animate_hover(0.0)
        super().leaveEvent(event)

    def _animate_hover(self, target: float):
        self._hover_animation.stop()
        self._hover_animation.setStartValue(self._hover_progress)
        self._hover_animation.setEndValue(target)
        self._hover_animation.start()

    def paintEvent(self, event):
        if _is_dark():
            surface = QColor("#252525")
            hover_top = QColor("#353535")
            hover_bottom = QColor("#2b2b2b")
        else:
            surface = QColor("#f2f2f2")
            hover_top = QColor("#e8e8e8")
            hover_bottom = QColor("#dddddd")

        top = _mix(surface, hover_top, self._hover_progress)
        bottom = _mix(surface, hover_bottom, self._hover_progress)
        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, top)
        gradient.setColorAt(1.0, bottom)

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(QPen(QColor(0, 0, 0, 0)))
        painter.setBrush(gradient)
        painter.drawRoundedRect(self.rect(), 4, 4)

        if self._selection_progress > 0.001:
            accent = QColor("#eb5757")
            accent.setAlpha(round(255 * self._selection_progress))
            painter.setBrush(QColor(0, 0, 0, 0))
            painter.setPen(QPen(accent, 1.5))
            painter.drawRoundedRect(self.rect().adjusted(1, 1, -1, -1), 3, 3)
        painter.end()
        super().paintEvent(event)


class HoverAnimationFilter(QObject):
    """Animate common Hub controls that cannot transition through QSS alone."""

    def eventFilter(self, watched, event):
        if isinstance(watched, (QPushButton, QLineEdit, QComboBox)):
            if event.type() == QEvent.Type.Enter:
                self._animate(watched, 1.0)
            elif event.type() == QEvent.Type.Leave:
                self._animate(watched, 0.0)
            elif event.type() in (QEvent.Type.FocusIn, QEvent.Type.FocusOut):
                self._apply(watched, float(getattr(watched, "_hub_hover_progress", 0.0)))
        return super().eventFilter(watched, event)

    def _animate(self, widget: QWidget, target: float):
        if not widget.isEnabled() or widget.objectName() in {"cardAvatar", "iconBtn"}:
            return
        animation = getattr(widget, "_hub_hover_animation", None)
        if animation is None:
            animation = QVariantAnimation(widget)
            animation.setDuration(160)
            animation.setEasingCurve(QEasingCurve.Type.OutCubic)
            animation.valueChanged.connect(lambda value, item=widget: self._apply(item, float(value)))
            animation.finished.connect(lambda item=widget: self._finish_animation(item))
            widget._hub_hover_animation = animation
        animation.stop()
        widget._hub_hover_target = target
        animation.setStartValue(float(getattr(widget, "_hub_hover_progress", 0.0)))
        animation.setEndValue(target)
        animation.start()

    @staticmethod
    def _finish_animation(widget: QWidget):
        """Return controls to QSS after a leave transition finishes.

        Keeping an inline background on a navigation item can visually pin its
        hover state even when the numeric animation has already returned to 0.
        Clearing it here restores the transparent inactive and active QSS states.
        """
        if float(getattr(widget, "_hub_hover_target", 1.0)) > 0.0:
            return
        widget._hub_hover_progress = 0.0
        widget.setStyleSheet("")

    def _apply(self, widget: QWidget, progress: float):
        widget._hub_hover_progress = progress
        dark = _is_dark()
        if isinstance(widget, QPushButton):
            name = widget.objectName()
            text_base = QColor("#f2f2f2" if dark else "#202020")
            text_hover = text_base
            if name in {"primaryBtn", "createBtn"}:
                base, hover = QColor("#eb5757"), QColor("#f26a6a")
                text_base = text_hover = QColor("#ffffff")
            elif name == "dangerBtn":
                base = QColor("#3a3a3a" if dark else "#dddddd")
                hover = QColor("#b83f3f" if dark else "#b8313b")
                text_base = QColor("#eb5757" if dark else "#b8313b")
                text_hover = QColor("#ffffff")
            elif name == "navItem":
                if bool(widget.property("active")):
                    base = QColor("#414141" if dark else "#d5d5d5")
                else:
                    base = QColor("#232323" if dark else "#e8e8e8")
                hover = QColor("#333333" if dark else "#dedede")
                text_base = QColor("#bdbdbd" if dark else "#5f5f5f")
                text_hover = QColor("#f2f2f2" if dark else "#202020")
            else:
                base = QColor("#3a3a3a" if dark else "#dddddd")
                hover = QColor("#4a4a4a" if dark else "#cccccc")
            widget.setStyleSheet(
                f"background-color: {_hex(_mix(base, hover, progress))};"
                f"color: {_hex(_mix(text_base, text_hover, progress))};"
            )
            return

        base = QColor("#191919" if dark else "#f2f2f2")
        hover = QColor("#292929" if dark else "#e8e8e8")
        border_base = QColor("#363636" if dark else "#cfcfcf")
        border_hover = QColor("#585858" if dark else "#999999")
        border = QColor("#eb5757") if widget.hasFocus() else _mix(border_base, border_hover, progress)
        widget.setStyleSheet(
            f"background-color: {_hex(_mix(base, hover, progress))};"
            f"border-color: {_hex(border)};"
        )


def ensure_hover_animation_filter(app: QApplication) -> HoverAnimationFilter:
    animator = getattr(app, "_infernux_hover_animator", None)
    if animator is None:
        animator = HoverAnimationFilter(app)
        app.installEventFilter(animator)
        app._infernux_hover_animator = animator
    return animator


__all__ = ["AnimatedSurfaceFrame", "HoverAnimationFilter", "ensure_hover_animation_filter"]
