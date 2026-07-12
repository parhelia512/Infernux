/**
 * @file BindingCommandBuffer.cpp
 * @brief pybind11 bindings for CommandBuffer + RenderTargetHandle + enhanced SRC.
 *
 * Part of the deferred command-buffer binding surface.
 *
 * Exposes the deferred-recording CommandBuffer API to Python, allowing
 * users to write custom render pipelines with full control over render
 * targets and global shader parameters.
 */

#include <function/renderer/CommandBuffer.h>
#include <function/resources/InxMaterial/InxMaterial.h>

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

using namespace infernux;
namespace py = pybind11;

namespace infernux
{

void RegisterCommandBufferBindings(py::module_ &m)
{
    // ---- RenderTargetHandle ----
    py::class_<RenderTargetHandle>(m, "RenderTargetHandle", "Opaque handle to a temporary or persistent render target")
        .def(py::init<>())
        .def_readonly("id", &RenderTargetHandle::id, "Internal handle ID")
        .def("is_valid", &RenderTargetHandle::IsValid, "Check if this handle refers to a valid render target")
        .def("__repr__",
             [](const RenderTargetHandle &h) {
                 return "<RenderTargetHandle id=" + std::to_string(h.id) + (h.IsValid() ? " valid" : " invalid") + ">";
             })
        .def("__eq__", &RenderTargetHandle::operator==)
        .def("__ne__", &RenderTargetHandle::operator!=);

    // Expose the CAMERA_TARGET_HANDLE sentinel
    m.attr("CAMERA_TARGET") = CAMERA_TARGET_HANDLE;

    // ---- CommandBuffer ----
    py::class_<CommandBuffer>(m, "CommandBuffer",
                              "Deferred-recording command buffer for the Scriptable Render Pipeline.\n"
                              "\n"
                              "Commands are recorded but not immediately executed. Call\n"
                              "context.execute_command_buffer(cmd) to schedule execution,\n"
                              "then context.submit() to finalize the frame.\n"
                              "\n"
                              "Example::\n"
                              "\n"
                              "    cmd = CommandBuffer('ForwardRenderer')\n"
                              "    rt = cmd.get_temporary_rt(1920, 1080)\n"
                              "    cmd.set_render_target(rt)\n"
                              "    cmd.clear_render_target(True, True, 0.1, 0.1, 0.1, 1.0)\n"
                              "    cmd.draw_renderers(culling, drawing, filtering)\n"
                              "    cmd.release_temporary_rt(rt)\n"
                              "    context.execute_command_buffer(cmd)\n")
        .def(py::init<const std::string &>(), py::arg("name") = "",
             "Create a CommandBuffer with an optional debug name")

        // ---- Render Target Management ----
        .def("get_temporary_rt", &CommandBuffer::GetTemporaryRT, py::arg("width"), py::arg("height"),
             py::arg("format") = rhi::PixelFormat::RGBA8UNorm, py::arg("samples") = rhi::SampleCount::One,
             "Allocate a temporary render target (lazily created at execution time)")
        .def("release_temporary_rt", &CommandBuffer::ReleaseTemporaryRT, py::arg("handle"),
             "Mark a temporary render target for release (returned to pool at frame end)")
        .def(
            "set_render_target", [](CommandBuffer &self, RenderTargetHandle color) { self.SetRenderTarget(color); },
            py::arg("color"), "Set the active color render target")
        .def(
            "set_render_target_with_depth",
            [](CommandBuffer &self, RenderTargetHandle color, RenderTargetHandle depth) {
                self.SetRenderTarget(color, depth);
            },
            py::arg("color"), py::arg("depth"), "Set active color + depth render targets")
        .def("clear_render_target", &CommandBuffer::ClearRenderTarget, py::arg("clear_color"), py::arg("clear_depth"),
             py::arg("r"), py::arg("g"), py::arg("b"), py::arg("a"), py::arg("depth") = 1.0f,
             "Clear the currently-bound render target")

        // ---- Global Shader Parameters ----
        .def("set_global_texture", &CommandBuffer::SetGlobalTexture, py::arg("name"), py::arg("handle"),
             "Set a global texture shader parameter by name")
        .def("set_global_float", &CommandBuffer::SetGlobalFloat, py::arg("name"), py::arg("value"),
             "Set a global float shader parameter by name")
        .def("set_global_vector", &CommandBuffer::SetGlobalVector, py::arg("name"), py::arg("x"), py::arg("y"),
             py::arg("z"), py::arg("w"), "Set a global vec4 shader parameter by name")
        .def(
            "set_global_matrix",
            [](CommandBuffer &self, const std::string &name, py::list data) {
                if (py::len(data) != 16) {
                    throw std::runtime_error("set_global_matrix requires a list of 16 floats");
                }
                std::array<float, 16> arr;
                for (int i = 0; i < 16; i++)
                    arr[i] = data[i].cast<float>();
                self.SetGlobalMatrix(name, arr);
            },
            py::arg("name"), py::arg("data"),
            "Set a global 4x4 matrix shader parameter (list of 16 floats, column-major)")

        // ---- Misc ----
        .def("clear", &CommandBuffer::Clear, "Discard all recorded commands (reuse the buffer)")
        .def_property_readonly("name", &CommandBuffer::GetName, "Debug name of this CommandBuffer")
        .def_property_readonly("command_count", &CommandBuffer::GetCommandCount, "Number of recorded commands")
        .def("__repr__", [](const CommandBuffer &self) {
            return "<CommandBuffer '" + self.GetName() + "' commands=" + std::to_string(self.GetCommandCount()) + ">";
        });
}

} // namespace infernux
