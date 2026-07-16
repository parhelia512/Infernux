from project_paths import ProjectPathError, new_project_target, validate_project_name


class NewProjectModel:
    def __init__(self):
        self.name = ""
        self.path = ""

    def is_valid(self):
        try:
            validate_project_name(self.name)
            new_project_target(self.path, self.name)
            return True
        except ProjectPathError:
            return False

    def set_path(self, path):
        self.path = path
