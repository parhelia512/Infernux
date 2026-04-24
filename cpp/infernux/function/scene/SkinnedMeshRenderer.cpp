#include "SkinnedMeshRenderer.h"
#include "ComponentFactory.h"
#include "SceneManager.h"

#include <assimp/Importer.hpp>
#include <assimp/postprocess.h>
#include <assimp/scene.h>
#include <core/config/MathConstants.h>
#include <core/log/InxLog.h>
#include <function/resources/AssetRegistry/AssetRegistry.h>
#include <function/resources/InxResource/InxResourceMeta.h>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/quaternion.hpp>
#include <glm/gtx/norm.hpp>
#include <glm/gtx/quaternion.hpp>
#include <nlohmann/json.hpp>
#include <platform/filesystem/InxPath.h>

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <limits>
#include <unordered_map>

using json = nlohmann::json;

namespace infernux
{

namespace
{

constexpr uint32_t kMaxSkinInfluences = 4;

struct SkinInfluence
{
    uint32_t boneIndex[kMaxSkinInfluences]{0, 0, 0, 0};
    float weight[kMaxSkinInfluences]{0.0f, 0.0f, 0.0f, 0.0f};
};

struct RuntimeBone
{
    std::string name;
    int nodeIndex = -1;
    glm::mat4 inverseBind{1.0f};
};

struct RuntimeNode
{
    std::string name;
    int parent = -1;
    glm::mat4 bindLocal{1.0f};
    glm::mat4 bindGlobal{1.0f};
};

struct RuntimeTrack
{
    std::string nodeName;
    std::vector<std::pair<double, glm::vec3>> positions;
    std::vector<std::pair<double, glm::quat>> rotations;
    std::vector<std::pair<double, glm::vec3>> scales;
};

struct RuntimeAnimation
{
    std::string name;
    double durationTicks = 0.0;
    double ticksPerSecond = 25.0;
    std::vector<RuntimeTrack> tracks;
    std::unordered_map<std::string, size_t> trackByNode;
};

struct RuntimeSkinnedModel
{
    std::string sourcePath;
    float scaleFactor = 0.01f;
    std::vector<Vertex> baseVertices;
    std::vector<SkinInfluence> influences;
    std::vector<uint32_t> indices;
    std::vector<SubMesh> subMeshes;
    std::vector<RuntimeNode> nodes;
    std::unordered_map<std::string, int> nodeByName;
    std::vector<RuntimeBone> bones;
    std::unordered_map<std::string, uint32_t> boneByName;
    std::vector<RuntimeAnimation> animations;
};

static glm::mat4 AiToGlm(const aiMatrix4x4 &m)
{
    return glm::mat4(m.a1, m.b1, m.c1, m.d1, m.a2, m.b2, m.c2, m.d2, m.a3, m.b3, m.c3, m.d3, m.a4, m.b4, m.c4, m.d4);
}

static glm::vec3 AiToGlm(const aiVector3D &v)
{
    return glm::vec3(v.x, v.y, v.z);
}

static glm::quat AiToGlm(const aiQuaternion &q)
{
    return glm::quat(q.w, q.x, q.y, q.z);
}

static bool ReadFileBytes(const std::string &filePath, std::vector<char> &out)
{
    auto fsPath = ToFsPath(filePath);
    if (!std::filesystem::exists(fsPath))
        return false;

    std::ifstream file(fsPath, std::ios::binary | std::ios::ate);
    if (!file.is_open())
        return false;

    auto fileSize = file.tellg();
    if (fileSize <= 0)
        return false;

    out.resize(static_cast<size_t>(fileSize));
    file.seekg(0);
    file.read(out.data(), fileSize);
    return true;
}

static float ReadScaleFactor(const std::string &path, const std::string &guid)
{
    auto *adb = AssetRegistry::Instance().GetAssetDatabase();
    if (!adb)
        return 0.01f;

    const InxResourceMeta *meta = nullptr;
    if (!guid.empty())
        meta = adb->GetMetaByGuid(guid);
    if (!meta && !path.empty())
        meta = adb->GetMetaByPath(path);
    if (meta && meta->HasKey("scale_factor"))
        return meta->GetDataAs<float>("scale_factor");
    return 0.01f;
}

static std::string ResolveSourcePath(const std::string &path, const std::string &guid)
{
    auto *adb = AssetRegistry::Instance().GetAssetDatabase();
    if (adb && !guid.empty()) {
        const std::string resolved = adb->GetPathFromGuid(guid);
        if (!resolved.empty() && std::filesystem::exists(ToFsPath(resolved)))
            return resolved;
    }

    auto fsPath = ToFsPath(path);
    if (!path.empty() && std::filesystem::exists(fsPath))
        return path;
    return path;
}

static unsigned int BuildSkinnedAssimpFlags()
{
    return aiProcess_Triangulate | aiProcess_GenSmoothNormals | aiProcess_CalcTangentSpace | aiProcess_FlipUVs |
           aiProcess_JoinIdenticalVertices | aiProcess_SortByPType | aiProcess_ValidateDataStructure |
           aiProcess_ImproveCacheLocality;
}

static void CollectNodes(const aiNode *node, int parent, const glm::mat4 &parentGlobal, RuntimeSkinnedModel &out)
{
    const int index = static_cast<int>(out.nodes.size());
    RuntimeNode rn;
    rn.name = node->mName.C_Str();
    rn.parent = parent;
    rn.bindLocal = AiToGlm(node->mTransformation);
    rn.bindGlobal = parentGlobal * rn.bindLocal;
    out.nodeByName[rn.name] = index;
    out.nodes.push_back(rn);

    for (unsigned int i = 0; i < node->mNumChildren; ++i)
        CollectNodes(node->mChildren[i], index, rn.bindGlobal, out);
}

static void CollectMeshNodes(const aiNode *node, RuntimeSkinnedModel &model, std::vector<std::pair<uint32_t, int>> &out)
{
    int nodeIndex = -1;
    auto it = model.nodeByName.find(node->mName.C_Str());
    if (it != model.nodeByName.end())
        nodeIndex = it->second;

    for (unsigned int i = 0; i < node->mNumMeshes; ++i)
        out.push_back({node->mMeshes[i], nodeIndex});

    for (unsigned int i = 0; i < node->mNumChildren; ++i)
        CollectMeshNodes(node->mChildren[i], model, out);
}

static void AddInfluence(SkinInfluence &inf, uint32_t boneIndex, float weight)
{
    if (weight <= 0.0f)
        return;

    for (uint32_t i = 0; i < kMaxSkinInfluences; ++i) {
        if (inf.weight[i] <= 0.0f) {
            inf.boneIndex[i] = boneIndex;
            inf.weight[i] = weight;
            return;
        }
    }

    uint32_t lightest = 0;
    for (uint32_t i = 1; i < kMaxSkinInfluences; ++i)
        if (inf.weight[i] < inf.weight[lightest])
            lightest = i;
    if (weight > inf.weight[lightest]) {
        inf.boneIndex[lightest] = boneIndex;
        inf.weight[lightest] = weight;
    }
}

static void NormalizeInfluences(RuntimeSkinnedModel &model)
{
    for (auto &inf : model.influences) {
        float total = 0.0f;
        for (float w : inf.weight)
            total += w;
        if (total <= kEpsilon) {
            if (!model.bones.empty()) {
                inf.boneIndex[0] = 0;
                inf.weight[0] = 1.0f;
            }
            continue;
        }
        for (float &w : inf.weight)
            w /= total;
    }
}

static uint32_t GetOrCreateBone(RuntimeSkinnedModel &model, const aiBone *bone)
{
    const std::string name = bone->mName.C_Str();
    auto it = model.boneByName.find(name);
    if (it != model.boneByName.end())
        return it->second;

    RuntimeBone rb;
    rb.name = name;
    rb.inverseBind = AiToGlm(bone->mOffsetMatrix);
    auto nodeIt = model.nodeByName.find(name);
    if (nodeIt != model.nodeByName.end())
        rb.nodeIndex = nodeIt->second;

    const uint32_t idx = static_cast<uint32_t>(model.bones.size());
    model.boneByName[name] = idx;
    model.bones.push_back(rb);
    return idx;
}

static glm::mat4 MakeTRS(const glm::vec3 &t, const glm::quat &r, const glm::vec3 &s)
{
    return glm::translate(glm::mat4(1.0f), t) * glm::toMat4(r) * glm::scale(glm::mat4(1.0f), s);
}

template <typename T> static size_t FindKeySpan(const std::vector<std::pair<double, T>> &keys, double t)
{
    if (keys.size() < 2)
        return 0;
    for (size_t i = 0; i + 1 < keys.size(); ++i)
        if (t < keys[i + 1].first)
            return i;
    return keys.size() - 2;
}

static glm::vec3 SampleVec3(const std::vector<std::pair<double, glm::vec3>> &keys, double t, const glm::vec3 &fallback)
{
    if (keys.empty())
        return fallback;
    if (keys.size() == 1)
        return keys[0].second;
    const size_t i = FindKeySpan(keys, t);
    const auto &a = keys[i];
    const auto &b = keys[i + 1];
    const double span = std::max(b.first - a.first, 1e-8);
    const float f = static_cast<float>((t - a.first) / span);
    return glm::mix(a.second, b.second, glm::clamp(f, 0.0f, 1.0f));
}

static glm::quat SampleQuat(const std::vector<std::pair<double, glm::quat>> &keys, double t, const glm::quat &fallback)
{
    if (keys.empty())
        return fallback;
    if (keys.size() == 1)
        return keys[0].second;
    const size_t i = FindKeySpan(keys, t);
    const auto &a = keys[i];
    const auto &b = keys[i + 1];
    const double span = std::max(b.first - a.first, 1e-8);
    const float f = static_cast<float>((t - a.first) / span);
    return glm::normalize(glm::slerp(a.second, b.second, glm::clamp(f, 0.0f, 1.0f)));
}

static void DecomposeTRS(const glm::mat4 &m, glm::vec3 &t, glm::quat &r, glm::vec3 &s)
{
    t = glm::vec3(m[3]);
    s = glm::vec3(glm::length(glm::vec3(m[0])), glm::length(glm::vec3(m[1])), glm::length(glm::vec3(m[2])));
    glm::mat3 rot(1.0f);
    if (s.x > kEpsilon)
        rot[0] = glm::vec3(m[0]) / s.x;
    if (s.y > kEpsilon)
        rot[1] = glm::vec3(m[1]) / s.y;
    if (s.z > kEpsilon)
        rot[2] = glm::vec3(m[2]) / s.z;
    r = glm::normalize(glm::quat_cast(rot));
}

static const RuntimeAnimation *FindAnimation(const RuntimeSkinnedModel &model, const std::string &takeName)
{
    if (model.animations.empty())
        return nullptr;
    if (!takeName.empty()) {
        for (const auto &anim : model.animations)
            if (anim.name == takeName)
                return &anim;
    }
    return &model.animations.front();
}

static void SampleSkinnedVertices(const RuntimeSkinnedModel &model, const std::string &takeName, float seconds,
                                  std::vector<Vertex> &outVertices)
{
    outVertices = model.baseVertices;
    if (outVertices.empty())
        return;

    const RuntimeAnimation *anim = FindAnimation(model, takeName);
    if (!anim || model.bones.empty()) {
        for (auto &v : outVertices)
            v.pos *= model.scaleFactor;
        return;
    }

    double tTicks = static_cast<double>(seconds) * anim->ticksPerSecond;
    if (anim->durationTicks > 0.0)
        tTicks = std::fmod(tTicks, anim->durationTicks);

    std::vector<glm::mat4> globals(model.nodes.size(), glm::mat4(1.0f));
    for (size_t ni = 0; ni < model.nodes.size(); ++ni) {
        const RuntimeNode &node = model.nodes[ni];
        glm::vec3 t;
        glm::quat r;
        glm::vec3 s;
        DecomposeTRS(node.bindLocal, t, r, s);

        auto trIt = anim->trackByNode.find(node.name);
        if (trIt != anim->trackByNode.end()) {
            const RuntimeTrack &track = anim->tracks[trIt->second];
            t = SampleVec3(track.positions, tTicks, t);
            r = SampleQuat(track.rotations, tTicks, r);
            s = SampleVec3(track.scales, tTicks, s);
        }

        glm::mat4 local = MakeTRS(t, r, s);
        globals[ni] = (node.parent >= 0) ? globals[static_cast<size_t>(node.parent)] * local : local;
    }

    std::vector<glm::mat4> boneMatrices(model.bones.size(), glm::mat4(1.0f));
    for (size_t bi = 0; bi < model.bones.size(); ++bi) {
        const RuntimeBone &bone = model.bones[bi];
        if (bone.nodeIndex >= 0 && static_cast<size_t>(bone.nodeIndex) < globals.size())
            // Match MeshLoader's model-space convention: keep the FBX/Assimp root transform
            // instead of cancelling it with inverse(root). Otherwise Blender Z-up motion
            // leaks into engine space as +Z instead of engine-up.
            boneMatrices[bi] = globals[static_cast<size_t>(bone.nodeIndex)] * bone.inverseBind;
    }

    for (size_t vi = 0; vi < outVertices.size() && vi < model.influences.size(); ++vi) {
        const Vertex &base = model.baseVertices[vi];
        const SkinInfluence &inf = model.influences[vi];

        glm::vec4 p(0.0f);
        glm::vec3 n(0.0f);
        glm::vec3 tangent(0.0f);
        float total = 0.0f;

        for (uint32_t i = 0; i < kMaxSkinInfluences; ++i) {
            const float w = inf.weight[i];
            const uint32_t bi = inf.boneIndex[i];
            if (w <= 0.0f || bi >= boneMatrices.size())
                continue;
            const glm::mat4 &m = boneMatrices[bi];
            p += w * (m * glm::vec4(base.pos, 1.0f));
            n += w * (glm::mat3(m) * base.normal);
            tangent += w * (glm::mat3(m) * glm::vec3(base.tangent));
            total += w;
        }

        if (total > kEpsilon) {
            outVertices[vi].pos = glm::vec3(p) * model.scaleFactor;
            if (glm::length2(n) > kEpsilon)
                outVertices[vi].normal = glm::normalize(n);
            if (glm::length2(tangent) > kEpsilon)
                outVertices[vi].tangent = glm::vec4(glm::normalize(tangent), base.tangent.w);
        } else {
            outVertices[vi].pos = base.pos * model.scaleFactor;
        }
    }
}

static std::shared_ptr<RuntimeSkinnedModel> LoadRuntimeSkinnedModel(const std::string &sourcePath, const std::string &guid)
{
    static std::unordered_map<std::string, std::weak_ptr<RuntimeSkinnedModel>> s_cache;

    const std::string resolvedPath = ResolveSourcePath(sourcePath, guid);
    const std::string cacheKey = !guid.empty() ? guid : resolvedPath;
    if (!cacheKey.empty()) {
        auto it = s_cache.find(cacheKey);
        if (it != s_cache.end()) {
            if (auto cached = it->second.lock())
                return cached;
        }
    }

    std::vector<char> bytes;
    if (!ReadFileBytes(resolvedPath, bytes)) {
        INXLOG_WARN("SkinnedMeshRenderer: could not open source model '", resolvedPath, "'");
        return nullptr;
    }

    auto fsPath = ToFsPath(resolvedPath);
    std::string ext = fsPath.extension().string();
    if (!ext.empty() && ext[0] == '.')
        ext = ext.substr(1);

    Assimp::Importer importer;
    const aiScene *scene = importer.ReadFileFromMemory(bytes.data(), bytes.size(), BuildSkinnedAssimpFlags(), ext.c_str());
    if (!scene || (scene->mFlags & AI_SCENE_FLAGS_INCOMPLETE) || !scene->mRootNode) {
        INXLOG_WARN("SkinnedMeshRenderer: Assimp failed for '", resolvedPath, "': ", importer.GetErrorString());
        return nullptr;
    }

    auto model = std::make_shared<RuntimeSkinnedModel>();
    model->sourcePath = resolvedPath;
    model->scaleFactor = ReadScaleFactor(resolvedPath, guid);
    CollectNodes(scene->mRootNode, -1, glm::mat4(1.0f), *model);

    std::vector<std::pair<uint32_t, int>> meshNodes;
    CollectMeshNodes(scene->mRootNode, *model, meshNodes);

    std::unordered_map<unsigned int, uint32_t> aiMatToSlot;
    uint32_t currentVertexOffset = 0;
    uint32_t currentIndexOffset = 0;

    for (const auto &[meshIndex, nodeIndex] : meshNodes) {
        if (meshIndex >= scene->mNumMeshes)
            continue;
        const aiMesh *aiM = scene->mMeshes[meshIndex];
        if (!(aiM->mPrimitiveTypes & aiPrimitiveType_TRIANGLE))
            continue;

        const uint32_t vertexStart = currentVertexOffset;
        const uint32_t indexStart = currentIndexOffset;
        const bool hasNormals = aiM->HasNormals();
        const bool hasTangents = aiM->HasTangentsAndBitangents();
        const bool hasUVs = aiM->HasTextureCoords(0);
        const bool hasColors = aiM->HasVertexColors(0);

        for (unsigned int v = 0; v < aiM->mNumVertices; ++v) {
            Vertex vert{};
            vert.pos = AiToGlm(aiM->mVertices[v]);
            vert.normal = hasNormals ? glm::normalize(AiToGlm(aiM->mNormals[v])) : glm::vec3(0.0f, 1.0f, 0.0f);
            if (hasTangents)
                vert.tangent = glm::vec4(glm::normalize(AiToGlm(aiM->mTangents[v])), 1.0f);
            else
                vert.tangent = glm::vec4(1.0f, 0.0f, 0.0f, 1.0f);
            if (hasUVs)
                vert.texCoord = glm::vec2(aiM->mTextureCoords[0][v].x, aiM->mTextureCoords[0][v].y);
            if (hasColors)
                vert.color = glm::vec3(aiM->mColors[0][v].r, aiM->mColors[0][v].g, aiM->mColors[0][v].b);
            else
                vert.color = glm::vec3(1.0f);
            model->baseVertices.push_back(vert);
            model->influences.push_back({});
        }

        for (unsigned int b = 0; b < aiM->mNumBones; ++b) {
            const aiBone *bone = aiM->mBones[b];
            const uint32_t boneIndex = GetOrCreateBone(*model, bone);
            for (unsigned int wi = 0; wi < bone->mNumWeights; ++wi) {
                const aiVertexWeight &w = bone->mWeights[wi];
                const uint32_t globalVertex = vertexStart + w.mVertexId;
                if (globalVertex < model->influences.size())
                    AddInfluence(model->influences[globalVertex], boneIndex, w.mWeight);
            }
        }

        for (unsigned int f = 0; f < aiM->mNumFaces; ++f) {
            const aiFace &face = aiM->mFaces[f];
            for (unsigned int idx = 0; idx < face.mNumIndices; ++idx) {
                model->indices.push_back(face.mIndices[idx] + vertexStart);
                ++currentIndexOffset;
            }
        }

        uint32_t slot = 0;
        auto slotIt = aiMatToSlot.find(aiM->mMaterialIndex);
        if (slotIt != aiMatToSlot.end()) {
            slot = slotIt->second;
        } else {
            slot = static_cast<uint32_t>(aiMatToSlot.size());
            aiMatToSlot[aiM->mMaterialIndex] = slot;
        }

        SubMesh sub;
        sub.indexStart = indexStart;
        sub.indexCount = currentIndexOffset - indexStart;
        sub.vertexStart = vertexStart;
        sub.vertexCount = aiM->mNumVertices;
        sub.materialSlot = slot;
        sub.nodeGroup = nodeIndex >= 0 ? static_cast<uint32_t>(nodeIndex) : 0;
        sub.name = aiM->mName.C_Str();
        model->subMeshes.push_back(std::move(sub));
        currentVertexOffset += aiM->mNumVertices;
    }

    NormalizeInfluences(*model);

    for (unsigned int ai = 0; ai < scene->mNumAnimations; ++ai) {
        const aiAnimation *src = scene->mAnimations[ai];
        RuntimeAnimation anim;
        anim.name = src->mName.C_Str();
        anim.durationTicks = src->mDuration;
        anim.ticksPerSecond = src->mTicksPerSecond > 0.0 ? src->mTicksPerSecond : 25.0;
        anim.tracks.reserve(src->mNumChannels);

        for (unsigned int ci = 0; ci < src->mNumChannels; ++ci) {
            const aiNodeAnim *ch = src->mChannels[ci];
            RuntimeTrack track;
            track.nodeName = ch->mNodeName.C_Str();
            track.positions.reserve(ch->mNumPositionKeys);
            track.rotations.reserve(ch->mNumRotationKeys);
            track.scales.reserve(ch->mNumScalingKeys);
            for (unsigned int k = 0; k < ch->mNumPositionKeys; ++k)
                track.positions.push_back({ch->mPositionKeys[k].mTime, AiToGlm(ch->mPositionKeys[k].mValue)});
            for (unsigned int k = 0; k < ch->mNumRotationKeys; ++k)
                track.rotations.push_back({ch->mRotationKeys[k].mTime, AiToGlm(ch->mRotationKeys[k].mValue)});
            for (unsigned int k = 0; k < ch->mNumScalingKeys; ++k)
                track.scales.push_back({ch->mScalingKeys[k].mTime, AiToGlm(ch->mScalingKeys[k].mValue)});

            anim.trackByNode[track.nodeName] = anim.tracks.size();
            anim.tracks.push_back(std::move(track));
        }
        model->animations.push_back(std::move(anim));
    }

    if (!cacheKey.empty())
        s_cache[cacheKey] = model;
    return model;
}

} // namespace

INFERNUX_REGISTER_COMPONENT("SkinnedMeshRenderer", SkinnedMeshRenderer)

void SkinnedMeshRenderer::SetSourceModelGuid(const std::string &guid)
{
    if (m_sourceModelGuid == guid)
        return;
    m_sourceModelGuid = guid;
    m_runtimeSkinnedVertices.clear();
    m_runtimeSkinnedIndices.clear();
    m_runtimeSkinnedSubMeshes.clear();
    RefreshRuntimeSkinnedMesh();
}

void SkinnedMeshRenderer::SetSourceModelPath(const std::string &path)
{
    if (m_sourceModelPath == path)
        return;
    m_sourceModelPath = path;
    m_runtimeSkinnedVertices.clear();
    m_runtimeSkinnedIndices.clear();
    m_runtimeSkinnedSubMeshes.clear();
    RefreshRuntimeSkinnedMesh();
}

void SkinnedMeshRenderer::SetActiveTakeName(const std::string &name)
{
    if (m_activeTakeName == name)
        return;
    m_activeTakeName = name;
    RefreshRuntimeSkinnedMesh();
}

void SkinnedMeshRenderer::SetRuntimeAnimationTime(float t)
{
    m_runtimeAnimationTime = t;
    RefreshRuntimeSkinnedMesh();
}

void SkinnedMeshRenderer::RefreshRuntimeSkinnedMesh()
{
    if (m_sourceModelGuid.empty() && m_sourceModelPath.empty())
        return;
    if (m_activeTakeName.empty())
        return;

    auto model = LoadRuntimeSkinnedModel(m_sourceModelPath, m_sourceModelGuid);
    if (!model)
        return;

    const bool wasEmpty = m_runtimeSkinnedVertices.empty();
    SampleSkinnedVertices(*model, m_activeTakeName, m_runtimeAnimationTime, m_runtimeSkinnedVertices);
    m_runtimeSkinnedIndices = model->indices;
    m_runtimeSkinnedSubMeshes = model->subMeshes;

    MarkMeshBufferDirty();
    if (wasEmpty)
        SceneManager::Instance().NotifyMeshRendererChanged(this);
}

std::string SkinnedMeshRenderer::Serialize() const
{
    json j = json::parse(MeshRenderer::Serialize());
    if (!m_sourceModelGuid.empty())
        j["sourceModelGuid"] = m_sourceModelGuid;
    if (!m_sourceModelPath.empty())
        j["sourceModelPath"] = m_sourceModelPath;
    if (!m_animationTakeNames.empty())
        j["animationTakeNames"] = m_animationTakeNames;
    if (!m_activeTakeName.empty())
        j["activeTakeName"] = m_activeTakeName;
    return j.dump(2);
}

bool SkinnedMeshRenderer::Deserialize(const std::string &jsonStr)
{
    if (!MeshRenderer::Deserialize(jsonStr))
        return false;

    try {
        json j = json::parse(jsonStr);
        m_sourceModelGuid = j.value("sourceModelGuid", std::string());
        m_sourceModelPath = j.value("sourceModelPath", std::string());
        m_activeTakeName = j.value("activeTakeName", std::string());
        m_animationTakeNames.clear();
        if (j.contains("animationTakeNames") && j["animationTakeNames"].is_array()) {
            for (const auto &v : j["animationTakeNames"]) {
                if (v.is_string())
                    m_animationTakeNames.push_back(v.get<std::string>());
            }
        }
        return true;
    } catch (...) {
        return false;
    }
}

std::unique_ptr<Component> SkinnedMeshRenderer::Clone() const
{
    auto clone = std::make_unique<SkinnedMeshRenderer>();
    const uint64_t newId = clone->GetComponentID();
    clone->Deserialize(Serialize());
    clone->SetComponentID(newId);
    return clone;
}

} // namespace infernux
