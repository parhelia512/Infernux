"""Type stubs for Infernux.core."""

from __future__ import annotations

from .material import Material as Material
from .texture import Texture as Texture
from .shader import Shader as Shader
from .audio_clip import AudioClip as AudioClip
from .physic_material import PhysicMaterial as PhysicMaterial
from .assets import AssetManager as AssetManager
from .asset_types import (
    TextureImportSettings as TextureImportSettings,
    TextureType as TextureType,
    WrapMode as WrapMode,
    FilterMode as FilterMode,
    ShaderAssetInfo as ShaderAssetInfo,
    FontAssetInfo as FontAssetInfo,
    AudioImportSettings as AudioImportSettings,
    AudioCompressionFormat as AudioCompressionFormat,
    MeshImportSettings as MeshImportSettings,
)
from .asset_ref import (
    TextureRef as TextureRef,
    ShaderRef as ShaderRef,
    AudioClipRef as AudioClipRef,
    PhysicMaterialRef as PhysicMaterialRef,
)

__all__ = [
    "Material",
    "Texture",
    "Shader",
    "AudioClip",
    "PhysicMaterial",
    "AssetManager",
    "TextureImportSettings",
    "TextureType",
    "WrapMode",
    "FilterMode",
    "ShaderAssetInfo",
    "FontAssetInfo",
    "AudioImportSettings",
    "AudioCompressionFormat",
    "MeshImportSettings",
    "TextureRef",
    "ShaderRef",
    "AudioClipRef",
    "PhysicMaterialRef",
]
