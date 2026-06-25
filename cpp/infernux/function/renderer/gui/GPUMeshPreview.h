#pragma once

#include <function/renderer/vk/VkHandle.h>
#include <function/resources/InxMaterial/InxMaterial.h>
#include <function/resources/InxMesh/InxMesh.h>
#include <glm/glm.hpp>
#include <memory>
#include <vector>

namespace infernux
{

class InxVkCoreModular;
class AssetDatabase;

/// @brief GPU-based mesh preview renderer.
///
/// Renders an arbitrary InxMesh (with per-submesh materials) into a small
/// offscreen framebuffer and reads back RGBA8 pixels for editor thumbnails.
/// Camera is auto-fitted to the mesh AABB.
///
/// Reuses the same render-pass format as GPUMaterialPreview so material
/// pipelines created for either previewer are compatible.
class GPUMeshPreview
{
  public:
    explicit GPUMeshPreview(InxVkCoreModular *vkCore);
    ~GPUMeshPreview();

    GPUMeshPreview(const GPUMeshPreview &) = delete;
    GPUMeshPreview &operator=(const GPUMeshPreview &) = delete;

    /// @brief Render a mesh with its materials and return RGBA8 pixels.
    /// @param mesh       The mesh to render (must have valid vertices/indices).
    /// @param materials  Per-submesh materials. Index matches SubMesh::materialSlot.
    ///                   Use nullptr entries for missing materials (will use default).
    /// @param size       Output image width and height (square).
    /// @param outPixels  Receives size*size*4 bytes of RGBA8 pixel data.
    /// @return true on success.
    bool RenderToPixels(const InxMesh &mesh, const std::vector<std::shared_ptr<InxMaterial>> &materials, int size,
                        std::vector<unsigned char> &outPixels);

    /// @brief Same as RenderToPixels but with an explicit camera (no auto-fit), used
    ///        for the interactive Timeline preview viewport (orbit / zoom).
    /// @param cloneMaterials  When true (default) each material is cloned per render
    ///        for isolation (thumbnails). When false the caller's materials are used
    ///        directly — they MUST be dedicated, persistent preview clones so their
    ///        cached pipeline is reused every frame (live previews; avoids rebuilding
    ///        a pipeline on every frame, which tanks playback FPS).
    bool RenderToPixelsCamera(const InxMesh &mesh, const std::vector<std::shared_ptr<InxMaterial>> &materials, int size,
                              const glm::mat4 &view, const glm::mat4 &proj, const glm::vec3 &cameraPos,
                              std::vector<unsigned char> &outPixels, bool cloneMaterials = true);

    /// @brief Live editor preview: render directly into a GPU image and return an
    ///        ImGui texture id.  Avoids CPU readback + re-upload every frame
    ///        (same idea as SceneRenderTarget).  Uses scene MSAA/format settings.
    uint64_t RenderToImGuiTextureCamera(const InxMesh &mesh, const std::vector<std::shared_ptr<InxMaterial>> &materials,
                                        int size, const glm::mat4 &view, const glm::mat4 &proj,
                                        const glm::vec3 &cameraPos, bool cloneMaterials = false);

  private:
    bool EnsureResources(int size);
    void EnsureImGuiDisplayDescriptor();
    void DestroyImGuiDisplayDescriptor();
    void CreateRenderPass();
    void CreateFramebuffer(int size);
    void DestroyFramebuffer();

    InxVkCoreModular *m_vkCore = nullptr;
    int m_currentSize = 0;

    VkRenderPass m_renderPass = VK_NULL_HANDLE;

    vk::VkImageHandle m_msaaColor;
    vk::VkImageHandle m_resolveColor;
    vk::VkImageHandle m_depth;

    VkFramebuffer m_framebuffer = VK_NULL_HANDLE;
    vk::VkBufferHandle m_staging;

    VkDescriptorSet m_fallbackShadowDescSet = VK_NULL_HANDLE;

    VkSampler m_displaySampler = VK_NULL_HANDLE;
    VkDescriptorSet m_displayDescriptorSet = VK_NULL_HANDLE;
    bool m_displayImageShaderReady = false;

    VkFormat m_colorFormat = VK_FORMAT_UNDEFINED;
    VkFormat m_depthFormat = VK_FORMAT_UNDEFINED;
    VkSampleCountFlagBits m_sampleCount = VK_SAMPLE_COUNT_1_BIT;
};

} // namespace infernux
