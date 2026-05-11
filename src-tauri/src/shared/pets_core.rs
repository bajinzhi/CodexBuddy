use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::codex::home as codex_home;

const MAX_ASSET_BYTES: u64 = 5 * 1024 * 1024;
const PETS_DIR: &str = "pets";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetDefinitionResponse {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) source: String,
    pub(crate) description: Option<String>,
    pub(crate) thumbnail_path: Option<String>,
    pub(crate) thumbnail_data_url: Option<String>,
    pub(crate) forms: Vec<PetFormDefinitionResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetFormDefinitionResponse {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) animations: Vec<PetAnimationDefinitionResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetAnimationDefinitionResponse {
    pub(crate) state: String,
    pub(crate) asset_path: String,
    pub(crate) frame_count: Option<u32>,
    pub(crate) frame_width: Option<u32>,
    pub(crate) frame_height: Option<u32>,
    pub(crate) fps: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetAssetResponse {
    pub(crate) data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub(crate) struct ReadPetAssetRequest {
    pub(crate) pet_id: String,
    pub(crate) asset_path: String,
}

pub(crate) fn list_pets_core() -> Result<Vec<PetDefinitionResponse>, String> {
    let codex_home = codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    list_pets_from_home(&codex_home)
}

pub(crate) fn read_pet_asset_core(
    pet_id: &str,
    asset_path: &str,
) -> Result<PetAssetResponse, String> {
    let codex_home = codex_home::resolve_default_codex_home()
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())?;
    read_pet_asset_from_home(&codex_home, pet_id, asset_path)
}

pub(crate) fn list_pets_from_home(codex_home: &Path) -> Result<Vec<PetDefinitionResponse>, String> {
    let pets_dir = codex_home.join(PETS_DIR);
    if !pets_dir.exists() {
        return Ok(Vec::new());
    }
    if !pets_dir.is_dir() {
        return Err(format!("{} is not a directory", pets_dir.display()));
    }

    let mut pets = Vec::new();
    for entry in
        fs::read_dir(&pets_dir).map_err(|err| format!("Failed to read pets directory: {err}"))?
    {
        let entry = entry.map_err(|err| format!("Failed to read pet entry: {err}"))?;
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Failed to inspect pet entry: {err}"))?;
        if !file_type.is_dir() {
            continue;
        }

        let id = entry.file_name().to_string_lossy().trim().to_string();
        if !is_safe_pet_id(&id) {
            continue;
        }
        if let Some(pet) = read_pet_manifest(&id, &entry.path()) {
            pets.push(pet);
        }
    }
    pets.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(pets)
}

pub(crate) fn read_pet_asset_from_home(
    codex_home: &Path,
    pet_id: &str,
    asset_path: &str,
) -> Result<PetAssetResponse, String> {
    if !is_safe_pet_id(pet_id) {
        return Err("Invalid pet id".to_string());
    }
    let relative = validate_asset_path(asset_path)?;
    let root = codex_home.join(PETS_DIR).join(pet_id);
    let root_canonical = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve pet package: {err}"))?;
    let target = root.join(&relative);
    let target_canonical = target
        .canonicalize()
        .map_err(|err| format!("Failed to resolve pet asset: {err}"))?;
    if !target_canonical.starts_with(&root_canonical) {
        return Err("Pet asset path escapes the package".to_string());
    }

    let mime_type = mime_type_for_asset(&target_canonical)
        .ok_or_else(|| "Unsupported pet asset type".to_string())?;
    let metadata = fs::metadata(&target_canonical)
        .map_err(|err| format!("Failed to inspect pet asset: {err}"))?;
    if metadata.len() > MAX_ASSET_BYTES {
        return Err("Pet asset is too large".to_string());
    }

    let bytes =
        fs::read(&target_canonical).map_err(|err| format!("Failed to read pet asset: {err}"))?;
    let encoded = STANDARD.encode(bytes);
    Ok(PetAssetResponse {
        data_url: format!("data:{mime_type};base64,{encoded}"),
    })
}

fn read_pet_manifest(id: &str, package_dir: &Path) -> Option<PetDefinitionResponse> {
    let manifest_path = ["pet.json", "manifest.json"]
        .iter()
        .map(|name| package_dir.join(name))
        .find(|path| path.is_file())?;
    let raw = fs::read_to_string(manifest_path).ok()?;
    let manifest: Value = serde_json::from_str(&raw).ok()?;
    let name = string_field(&manifest, &["name", "displayName", "label"])
        .unwrap_or_else(|| humanize_id(id));
    let description = string_field(&manifest, &["description", "summary"]);
    let thumbnail_path = string_field(
        &manifest,
        &["thumbnailPath", "thumbnail", "icon", "image", "src"],
    )
    .filter(|path| validate_asset_path(path).is_ok());
    let forms = parse_forms(&manifest);
    if forms.is_empty() {
        return None;
    }

    Some(PetDefinitionResponse {
        id: id.to_string(),
        name,
        source: "codex".to_string(),
        description,
        thumbnail_path,
        thumbnail_data_url: None,
        forms,
    })
}

fn parse_forms(manifest: &Value) -> Vec<PetFormDefinitionResponse> {
    let mut forms = Vec::new();
    if let Some(forms_object) = object_field(manifest, &["forms", "variants", "morphs"]) {
        for (form_id, form_value) in forms_object {
            if let Some(form) = parse_form(form_id, form_value) {
                forms.push(form);
            }
        }
    }

    if forms.is_empty() {
        let animations = parse_animations(manifest);
        if !animations.is_empty() {
            forms.push(PetFormDefinitionResponse {
                id: "normal".to_string(),
                label: "Normal".to_string(),
                animations,
            });
        }
    }

    forms.sort_by(|left, right| left.id.cmp(&right.id));
    forms
}

fn parse_form(form_id: &str, form_value: &Value) -> Option<PetFormDefinitionResponse> {
    if !is_safe_manifest_key(form_id) {
        return None;
    }
    let animations = parse_animations(form_value);
    if animations.is_empty() {
        return None;
    }

    Some(PetFormDefinitionResponse {
        id: form_id.to_string(),
        label: string_field(form_value, &["label", "name", "displayName"])
            .unwrap_or_else(|| humanize_id(form_id)),
        animations,
    })
}

fn parse_animations(value: &Value) -> Vec<PetAnimationDefinitionResponse> {
    let mut animations = Vec::new();
    if let Some(states) = object_field(value, &["animations", "states", "sprites"]) {
        for (state, animation_value) in states {
            if let Some(animation) = parse_animation(state, animation_value) {
                animations.push(animation);
            }
        }
    }

    if animations.is_empty() {
        if let Some(animation) = parse_animation("idle", value) {
            animations.push(animation);
        }
    }

    animations.sort_by(|left, right| left.state.cmp(&right.state));
    animations
}

fn parse_animation(state: &str, value: &Value) -> Option<PetAnimationDefinitionResponse> {
    if !is_safe_manifest_key(state) {
        return None;
    }
    let asset_path = match value {
        Value::String(path) => path.trim().to_string(),
        Value::Object(_) => string_field(
            value,
            &[
                "assetPath",
                "path",
                "src",
                "image",
                "spriteSheet",
                "spritesheet",
            ],
        )?,
        _ => return None,
    };
    if validate_asset_path(&asset_path).is_err() {
        return None;
    }

    Some(PetAnimationDefinitionResponse {
        state: state.to_string(),
        asset_path,
        frame_count: u32_field(value, &["frameCount", "frames"]),
        frame_width: u32_field(value, &["frameWidth"]),
        frame_height: u32_field(value, &["frameHeight"]),
        fps: u32_field(value, &["fps", "frameRate"]),
    })
}

fn object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a serde_json::Map<String, Value>> {
    keys.iter().find_map(|key| value.get(*key)?.as_object())
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let raw = value.get(*key)?.as_str()?.trim();
        if raw.is_empty() {
            None
        } else {
            Some(raw.to_string())
        }
    })
}

fn u32_field(value: &Value, keys: &[&str]) -> Option<u32> {
    keys.iter().find_map(|key| {
        let raw = value.get(*key)?;
        if let Some(value) = raw.as_u64() {
            return u32::try_from(value).ok();
        }
        raw.as_str()?.trim().parse::<u32>().ok()
    })
}

fn is_safe_pet_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        && value != "."
        && value != ".."
}

fn is_safe_manifest_key(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        && value != "."
        && value != ".."
}

fn validate_asset_path(value: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Pet asset path is required".to_string());
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        return Err("Pet asset path must be relative".to_string());
    }
    for component in path.components() {
        if matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        ) {
            return Err("Pet asset path must stay inside the package".to_string());
        }
    }
    if mime_type_for_asset(&path).is_none() {
        return Err("Unsupported pet asset type".to_string());
    }
    Ok(path)
}

fn mime_type_for_asset(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn humanize_id(id: &str) -> String {
    let words: Vec<String> = id
        .split(['-', '_', '.'])
        .filter(|part| !part.trim().is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect();
    if words.is_empty() {
        id.to_string()
    } else {
        words.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_codex_home(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("codexbuddy-pets-{name}-{unique}"))
    }

    #[test]
    fn missing_pets_dir_returns_empty_list() {
        let home = temp_codex_home("missing");
        let pets = list_pets_from_home(&home).expect("list pets");
        assert!(pets.is_empty());
    }

    #[test]
    fn parses_multi_form_pet_manifest() {
        let home = temp_codex_home("manifest");
        let package = home.join(PETS_DIR).join("spark");
        fs::create_dir_all(&package).expect("create package");
        fs::write(package.join("idle.png"), b"png").expect("write asset");
        fs::write(package.join("charged.webp"), b"webp").expect("write asset");
        fs::write(
            package.join("pet.json"),
            r#"{
              "name": "Spark",
              "thumbnail": "idle.png",
              "forms": {
                "normal": {
                  "label": "Normal",
                  "animations": {
                    "idle": "idle.png"
                  }
                },
                "charged": {
                  "states": {
                    "working": {
                      "path": "charged.webp",
                      "frameCount": 4,
                      "fps": 12
                    }
                  }
                }
              }
            }"#,
        )
        .expect("write manifest");

        let pets = list_pets_from_home(&home).expect("list pets");
        assert_eq!(pets.len(), 1);
        assert_eq!(pets[0].id, "spark");
        assert_eq!(pets[0].forms.len(), 2);
        assert_eq!(pets[0].thumbnail_path.as_deref(), Some("idle.png"));
        assert!(pets[0].thumbnail_data_url.is_none());

        let charged = pets[0]
            .forms
            .iter()
            .find(|form| form.id == "charged")
            .expect("charged form");
        assert_eq!(charged.animations[0].frame_count, Some(4));
    }

    #[test]
    fn rejects_asset_path_traversal() {
        let home = temp_codex_home("traversal");
        let package = home.join(PETS_DIR).join("spark");
        fs::create_dir_all(&package).expect("create package");
        fs::write(home.join("secret.png"), b"secret").expect("write secret");

        let result = read_pet_asset_from_home(&home, "spark", "../secret.png");
        assert!(result.is_err());
    }

    #[test]
    fn reads_asset_as_data_url() {
        let home = temp_codex_home("asset");
        let package = home.join(PETS_DIR).join("spark");
        fs::create_dir_all(&package).expect("create package");
        fs::write(package.join("idle.svg"), b"<svg></svg>").expect("write asset");

        let response = read_pet_asset_from_home(&home, "spark", "idle.svg").expect("read asset");
        assert!(response.data_url.starts_with("data:image/svg+xml;base64,"));
    }
}
