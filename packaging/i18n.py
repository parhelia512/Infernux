"""Small runtime translation layer for the early Infernux Hub."""

from __future__ import annotations

import locale
import sys


_ZH = {
    "Projects": "项目",
    "Installs": "安装",
    "Settings": "设置",
    "Hub": "启动器",
    "Dark Mode": "深色模式",
    "Create, open and launch your Infernux projects.": "创建、打开并启动 Infernux 项目。",
    "Search projects...": "搜索项目……",
    "No projects yet": "还没有项目",
    "Create a new project or open an existing project to get started.": "创建新项目或打开已有项目以开始使用。",
    "Project path missing": "项目路径不存在",
    "Open project folder": "在资源管理器中显示项目",
    "Remove": "移除",
    "Relocate": "重新定位",
    "Migrate": "升级版本",
    "+ New Project": "+ 新建项目",
    "Open Existing": "打开已有项目",
    "Launch": "启动",
    "Remove the selected project from Hub without deleting its files": "从 Hub 移除所选项目，但不删除文件",
    "Update the location of the selected project": "更新所选项目的位置",
    "Migrate the selected project to another installed engine version": "将所选项目升级到另一个已安装的引擎版本",
    "No Selection": "未选择项目",
    "Please select a project to launch.": "请选择要启动的项目。",
    "Please select a project to remove from Hub.": "请选择要从 Hub 移除的项目。",
    "Please select a project to relocate.": "请选择要重新定位的项目。",
    "Please select a project to migrate.": "请选择要升级的项目。",
    "Project Path Missing": "项目路径不存在",
    "Project Already Open": "项目已打开",
    "Missing Runtime": "运行环境缺失",
    "Native Runtime Check Failed": "原生运行环境检查失败",
    "Open Existing Infernux Project": "打开已有 Infernux 项目",
    "Relocate Infernux Project": "重新定位 Infernux 项目",
    "Cannot Open Project": "无法打开项目",
    "Cannot Relocate Project": "无法重新定位项目",
    "Engine Version Not Installed": "未安装引擎版本",
    "Remove Project from Hub": "从 Hub 移除项目",
    "Project files will not be deleted.": "不会删除项目文件。",
    "Cancel": "取消",
    "Create": "创建",
    "Create New Project": "创建新项目",
    "Project Name:": "项目名称：",
    "Enter a name for your project": "输入项目名称",
    "Project Location:": "项目位置：",
    "No path selected": "未选择路径",
    "Browse...": "浏览……",
    "Engine Version:": "引擎版本：",
    "Choose Project Location": "选择项目位置",
    "Initializing": "正在初始化",
    "Preparing project...": "正在准备项目……",
    "Installs and managed runtime": "引擎版本与托管运行环境",
    "Locate": "导入本地版本",
    "Install Editor": "安装引擎",
    "Install Python 3.12": "安装 Python 3.12",
    "Reinstall Python 3.12": "修复 Python 3.12",
    "Python 3.12 runtime is ready": "Python 3.12 运行环境已就绪",
    "Python 3.12 runtime is missing": "Python 3.12 运行环境缺失",
    "Language": "语言",
    "System": "跟随系统",
    "Chinese": "中文",
    "English": "English",
    "Appearance": "外观",
    "System language is detected automatically on Windows.": "Windows 上会自动检测系统显示语言。",
    "Language changes apply after restarting Infernux Hub.": "重启 Infernux Hub 后应用语言更改。",
    "Restart Required": "需要重启",
    "The language preference was saved. Restart Infernux Hub to apply it everywhere.": "语言偏好已保存。请重启 Infernux Hub 以完整应用。",
    "Current language": "当前语言",
    "Initializing engine...": "正在初始化引擎……",
    "Checking project...": "正在检查项目……",
    "Starting engine process...": "正在启动引擎进程……",
    "Waiting for the editor...": "正在等待编辑器……",
    "Ready": "已就绪",
    "Launch failed": "启动失败",
    "Engine Launch Failed": "引擎启动失败",
    "Engine Launch Timed Out": "引擎启动超时",
    "The editor did not become ready within {seconds} seconds.": "编辑器未能在 {seconds} 秒内完成启动。",
    "Retry": "重试",
    "Open Logs": "打开日志",
    "Stop": "停止",
    "Keep Waiting": "继续等待",
    "Migrate Project": "升级项目",
    "Select target engine version:": "选择目标引擎版本：",
    "No Other Version": "没有其他版本",
    "Install another engine version before migrating this project.": "请先安装另一个引擎版本，再升级此项目。",
    "Confirm Project Migration": "确认项目升级",
    "A backup of Assets and ProjectSettings will be created before the runtime and version pin are changed.": "更改运行环境和版本锁定前，将备份 Assets 与 ProjectSettings。",
    "Project Migration Failed": "项目升级失败",
    "Project Migration Complete": "项目升级完成",
    "Backup created at:\n{path}": "备份已创建：\n{path}",
}

_mode = "system"
_language = "en"


def detect_system_locale() -> str:
    """Return the user's UI locale, preferring the Windows display language."""
    if sys.platform == "win32":
        try:
            import ctypes

            buffer = ctypes.create_unicode_buffer(85)
            if ctypes.windll.kernel32.GetUserDefaultLocaleName(buffer, len(buffer)):
                if buffer.value:
                    return buffer.value
        except (AttributeError, OSError):
            pass
    value = locale.getlocale()[0]
    return value or "en"


def resolve_language(mode: str = "system", *, system_locale: str | None = None) -> str:
    normalized_mode = str(mode or "system").strip().lower().replace("_", "-")
    if normalized_mode in {"zh", "zh-cn", "chinese"}:
        return "zh"
    if normalized_mode in {"en", "en-us", "english"}:
        return "en"
    detected = (system_locale or detect_system_locale()).lower().replace("_", "-")
    return "zh" if detected.startswith("zh") else "en"


def configure_language(mode: str = "system") -> str:
    global _mode, _language
    _mode = mode if mode in {"system", "zh", "en"} else "system"
    _language = resolve_language(_mode)
    return _language


def current_language() -> str:
    return _language


def language_mode() -> str:
    return _mode


def tr(text: str, **values) -> str:
    template = _ZH.get(text, text) if _language == "zh" else text
    return template.format(**values) if values else template


configure_language()


__all__ = [
    "configure_language",
    "current_language",
    "detect_system_locale",
    "language_mode",
    "resolve_language",
    "tr",
]
