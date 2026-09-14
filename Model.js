.pragma library

var STATE_PATH_SUFFIX = "/.local/state/omarchy/settings/theme-modes.json"
var MAX_OUTPUT_CHARS = 524288
var MAX_CATALOG_OUTPUT_CHARS = 524288
var MAX_BACKGROUND_OUTPUT_CHARS = 524288
var MAX_CATALOG_RECORDS = 256
var MAX_BACKGROUND_RECORDS = 256
var MAX_INPUT_LINE_CHARS = 256
var MAX_FIELD_CHARS = 4096
var MAX_STATE_CHARS = 65536
var MAX_PROFILES = 12
var MAX_PROFILE_NAME_CHARS = 48

function statePath(home) {
  return String(home || "") + STATE_PATH_SUFFIX
}

function clampText(raw, max) {
  var text = String(raw || "")
  return text.length > max ? text.slice(0, max) : text
}

function isValidSlug(slug) {
  var key = String(slug || "")
  if (!key || key === "." || key === "..") return false
  return /^[a-z0-9]+$/.test(key) || /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(key)
}

function slugFromName(name) {
  var raw = String(name || "")
  if (/[/\\]|\.\./.test(raw)) return ""
  var cleaned = raw
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/^[-_]+|[-_]+$/g, "")
    .replace(/[-_]{2,}/g, function(match) { return match.charAt(0) })
  return isValidSlug(cleaned) ? cleaned : ""
}

function isSafeLocalPath(path) {
  var text = String(path || "").trim()
  if (!text || text.indexOf("\0") >= 0) return false
  if (text.indexOf("..") >= 0) return false
  return text.charAt(0) === "/"
}

function defaultState(currentThemeSlug) {
  var slug = slugFromName(currentThemeSlug)
  var state = {
    lightTheme: slug || "flexoki-light",
    darkTheme: slug || "catppuccin",
    lightBackground: "",
    darkBackground: "",
    mode: "dark",
    manualOverride: true,
    autoEnabled: false,
    autoSource: "time",
    lightStart: "07:00",
    darkStart: "19:00",
    batteryDarkOnBattery: true
  }
  state.profiles = [profileFromState("default", "Default", state)]
  state.activeProfile = "default"
  return state
}

function profileFromState(id, name, state) {
  return {
    id: slugFromName(id) || "default",
    name: clampText(String(name || "Default").trim() || "Default", MAX_PROFILE_NAME_CHARS),
    lightTheme: slugFromName(state.lightTheme) || defaultStateTheme("light"),
    darkTheme: slugFromName(state.darkTheme) || defaultStateTheme("dark"),
    lightBackground: isSafeLocalPath(state.lightBackground) ? String(state.lightBackground) : "",
    darkBackground: isSafeLocalPath(state.darkBackground) ? String(state.darkBackground) : ""
  }
}

function defaultStateTheme(mode) {
  return mode === "light" ? "flexoki-light" : "catppuccin"
}

function normalizeProfiles(raw, fallbackState) {
  var fallback = profileFromState("default", "Default", fallbackState)
  if (!Array.isArray(raw)) return [fallback]
  var profiles = []
  var seen = {}
  for (var i = 0; i < raw.length && profiles.length < MAX_PROFILES; i++) {
    var item = raw[i]
    if (!item || typeof item !== "object") continue
    var id = slugFromName(item.id) || "profile-" + String(i + 1)
    if (seen[id]) continue
    var profile = profileFromState(id, item.name || id, {
      lightTheme: item.lightTheme || fallback.lightTheme,
      darkTheme: item.darkTheme || fallback.darkTheme,
      lightBackground: item.lightBackground || "",
      darkBackground: item.darkBackground || ""
    })
    seen[profile.id] = true
    profiles.push(profile)
  }
  return profiles.length > 0 ? profiles : [fallback]
}

function activeProfileId(state, requested) {
  var id = slugFromName(requested || state.activeProfile)
  var profiles = Array.isArray(state.profiles) ? state.profiles : []
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === id) return id
  }
  return profiles.length > 0 ? profiles[0].id : "default"
}

function applyProfile(state, requestedId) {
  var id = activeProfileId(state, requestedId)
  var profiles = Array.isArray(state.profiles) ? state.profiles : []
  for (var i = 0; i < profiles.length; i++) {
    var profile = profiles[i]
    if (profile.id === id) {
      return Object.assign({}, state, {
        activeProfile: id,
        lightTheme: profile.lightTheme,
        darkTheme: profile.darkTheme,
        lightBackground: profile.lightBackground,
        darkBackground: profile.darkBackground
      })
    }
  }
  return state
}

function updateActiveProfile(state) {
  var id = activeProfileId(state)
  var profiles = normalizeProfiles(state.profiles, state)
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === id) {
      profiles[i] = profileFromState(id, profiles[i].name, state)
      break
    }
  }
  return Object.assign({}, state, { profiles: profiles, activeProfile: id })
}

function createProfile(state) {
  var next = updateActiveProfile(state)
  var profiles = next.profiles.slice()
  if (profiles.length >= MAX_PROFILES) return next
  var number = profiles.length + 1
  var id = "profile-" + String(number)
  var seen = {}
  for (var i = 0; i < profiles.length; i++) seen[profiles[i].id] = true
  while (seen[id]) {
    number++
    id = "profile-" + String(number)
  }
  profiles.push(profileFromState(id, "Profile " + String(number), next))
  return applyProfile(Object.assign({}, next, { profiles: profiles, activeProfile: id }), id)
}

function renameActiveProfile(state, name) {
  var next = updateActiveProfile(state)
  var label = clampText(String(name || "").trim(), MAX_PROFILE_NAME_CHARS)
  if (!label) return next
  var profiles = next.profiles.slice()
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === next.activeProfile) {
      profiles[i] = Object.assign({}, profiles[i], { name: label })
      break
    }
  }
  return Object.assign({}, next, { profiles: profiles })
}

function removeActiveProfile(state) {
  var next = updateActiveProfile(state)
  if (next.profiles.length <= 1) return next
  var profiles = next.profiles.filter(function(profile) { return profile.id !== next.activeProfile })
  return applyProfile(Object.assign({}, next, { profiles: profiles, activeProfile: profiles[0].id }), profiles[0].id)
}

function nextProfile(state, direction) {
  var next = updateActiveProfile(state)
  var profiles = next.profiles
  var index = 0
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].id === next.activeProfile) { index = i; break }
  }
  var step = direction === -1 ? -1 : 1
  var target = profiles[(index + step + profiles.length) % profiles.length].id
  return applyProfile(next, target)
}

function parseStateFile(raw, currentThemeSlug) {
  var base = defaultState(currentThemeSlug)
  var text = clampText(raw, MAX_STATE_CHARS)
  if (!text.trim()) return base

  try {
    var parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return base
    if (parsed.lightTheme) {
      var light = slugFromName(parsed.lightTheme)
      if (light) base.lightTheme = light
    }
    if (parsed.darkTheme) {
      var dark = slugFromName(parsed.darkTheme)
      if (dark) base.darkTheme = dark
    }
    if (parsed.lightBackground && isSafeLocalPath(parsed.lightBackground))
      base.lightBackground = String(parsed.lightBackground)
    if (parsed.darkBackground && isSafeLocalPath(parsed.darkBackground))
      base.darkBackground = String(parsed.darkBackground)
    if (parsed.mode === "light" || parsed.mode === "dark") base.mode = parsed.mode
    if (typeof parsed.manualOverride === "boolean") base.manualOverride = parsed.manualOverride
    if (typeof parsed.autoEnabled === "boolean") base.autoEnabled = parsed.autoEnabled
    if (parsed.autoSource === "time" || parsed.autoSource === "battery") base.autoSource = parsed.autoSource
    if (parsed.lightStart) base.lightStart = normalizeTime(parsed.lightStart, base.lightStart)
    if (parsed.darkStart) base.darkStart = normalizeTime(parsed.darkStart, base.darkStart)
    if (typeof parsed.batteryDarkOnBattery === "boolean") base.batteryDarkOnBattery = parsed.batteryDarkOnBattery
    base.profiles = normalizeProfiles(parsed.profiles, base)
    base.activeProfile = activeProfileId(base, parsed.activeProfile)
    base = applyProfile(base, base.activeProfile)
  } catch (e) {
    return base
  }

  return base
}

function serializeState(state) {
  var normalized = updateActiveProfile(state)
  return JSON.stringify({
    lightTheme: slugFromName(normalized.lightTheme) || defaultStateTheme("light"),
    darkTheme: slugFromName(normalized.darkTheme) || defaultStateTheme("dark"),
    lightBackground: isSafeLocalPath(normalized.lightBackground) ? String(normalized.lightBackground) : "",
    darkBackground: isSafeLocalPath(normalized.darkBackground) ? String(normalized.darkBackground) : "",
    mode: normalized.mode === "light" ? "light" : "dark",
    manualOverride: !!normalized.manualOverride,
    autoEnabled: !!normalized.autoEnabled,
    autoSource: normalized.autoSource === "battery" ? "battery" : "time",
    lightStart: normalizeTime(normalized.lightStart, "07:00"),
    darkStart: normalizeTime(normalized.darkStart, "19:00"),
    batteryDarkOnBattery: normalized.batteryDarkOnBattery !== false,
    activeProfile: normalized.activeProfile,
    profiles: normalized.profiles
  }, null, 2) + "\n"
}

function normalizeTime(value, fallback) {
  var text = String(value || fallback || "00:00").trim()
  var match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallback
  var hour = Math.max(0, Math.min(23, parseInt(match[1], 10)))
  var minute = Math.max(0, Math.min(59, parseInt(match[2], 10)))
  return (hour < 10 ? "0" : "") + hour + ":" + (minute < 10 ? "0" : "") + minute
}

function parseTimeMinutes(value, fallbackMinutes) {
  var normalized = normalizeTime(value, minutesToTime(fallbackMinutes))
  var parts = normalized.split(":")
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function minutesToTime(totalMinutes) {
  var mins = Math.max(0, Math.min(23 * 60 + 59, totalMinutes | 0))
  var hour = Math.floor(mins / 60)
  var minute = mins % 60
  return (hour < 10 ? "0" : "") + hour + ":" + (minute < 10 ? "0" : "") + minute
}

function parseThemeList(raw) {
  var lines = clampText(raw, MAX_OUTPUT_CHARS).split("\n")
  var themes = []
  var seen = {}
  for (var i = 0; i < lines.length; i++) {
    var name = String(lines[i] || "").trim()
    if (!name) continue
    var slug = slugFromName(name)
    if (!slug || seen[slug]) continue
    seen[slug] = true
    themes.push({ name: name, slug: slug, previewPath: "" })
  }
  return themes
}

function parseThemeCatalog(raw) {
  var text = clampText(raw, MAX_CATALOG_OUTPUT_CHARS)
  if (!text.trim()) return []
  try {
    var parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    var themes = []
    var seen = {}
    var limit = Math.min(parsed.length, MAX_CATALOG_RECORDS)
    for (var i = 0; i < limit; i++) {
      var entry = parsed[i]
      if (!entry || typeof entry !== "object") continue
      var name = String(entry.name || "").trim()
      if (name.length > MAX_INPUT_LINE_CHARS) name = name.slice(0, MAX_INPUT_LINE_CHARS)
      var slug = slugFromName(entry.slug || name)
      if (!name || !slug || seen[slug]) continue
      var previewPath = String(entry.previewPath || "").trim()
      if (previewPath && (!isSafeLocalPath(previewPath) || previewPath.length > MAX_FIELD_CHARS))
        previewPath = ""
      seen[slug] = true
      themes.push({
        name: name,
        slug: slug,
        previewPath: previewPath
      })
    }
    return themes
  } catch (e) {
    return []
  }
}

function displayNameForSlug(slug, themes) {
  var key = slugFromName(slug)
  for (var i = 0; i < themes.length; i++) {
    if (themes[i].slug === key) return themes[i].name
  }
  return key.replace(/-/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase() })
}

function themeForMode(state) {
  return state.mode === "light" ? slugFromName(state.lightTheme) : slugFromName(state.darkTheme)
}

function backgroundForMode(state) {
  var path = state.mode === "light" ? String(state.lightBackground || "") : String(state.darkBackground || "")
  return isSafeLocalPath(path) ? path : ""
}

function backgroundInList(path, backgrounds) {
  var target = String(path || "")
  if (!isSafeLocalPath(target)) return false
  for (var i = 0; i < backgrounds.length; i++) {
    if (backgrounds[i] && backgrounds[i].path === target) return true
  }
  return false
}

function parseBackgroundCatalog(raw) {
  var text = clampText(raw, MAX_BACKGROUND_OUTPUT_CHARS)
  if (!text.trim()) return []
  try {
    var parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    var items = []
    var seen = {}
    var limit = Math.min(parsed.length, MAX_BACKGROUND_RECORDS)
    for (var i = 0; i < limit; i++) {
      var entry = parsed[i]
      if (!entry || typeof entry !== "object") continue
      var path = String(entry.path || "").trim()
      if (!isSafeLocalPath(path) || path.length > MAX_FIELD_CHARS || seen[path]) continue
      var thumbnailPath = String(entry.thumbnailPath || path).trim()
      if (!isSafeLocalPath(thumbnailPath) || thumbnailPath.length > MAX_FIELD_CHARS)
        thumbnailPath = path
      seen[path] = true
      items.push({
        path: path,
        name: String(entry.name || ""),
        thumbnailPath: thumbnailPath
      })
    }
    return items
  } catch (e) {
    return []
  }
}

function parseBootstrapPayload(raw) {
  var text = clampText(raw, MAX_STATE_CHARS + 512)
  if (!text.trim()) return { state: "", currentTheme: "" }
  try {
    var parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return { state: "", currentTheme: "" }
    return {
      state: clampText(parsed.state, MAX_STATE_CHARS),
      currentTheme: clampText(parsed.currentTheme, 256)
    }
  } catch (e) {
    return { state: "", currentTheme: "" }
  }
}

function computeAutoMode(state, onBattery, date) {
  if (!state.autoEnabled) return state.mode
  if (state.autoSource === "battery") {
    return onBattery ? "dark" : "light"
  }

  var now = date instanceof Date ? date : new Date()
  var current = now.getHours() * 60 + now.getMinutes()
  var lightStart = parseTimeMinutes(state.lightStart, 7 * 60)
  var darkStart = parseTimeMinutes(state.darkStart, 19 * 60)
  if (lightStart === darkStart) return state.mode

  if (lightStart < darkStart) {
    return (current >= lightStart && current < darkStart) ? "light" : "dark"
  }
  return (current >= lightStart || current < darkStart) ? "light" : "dark"
}

function statusLabel(state, onBattery) {
  if (state.manualOverride) return "Manual"
  if (!state.autoEnabled) return "Manual"
  if (state.autoSource === "battery") return onBattery ? "Auto · battery" : "Auto · AC"
  return "Auto · schedule"
}

function modeIcon(mode) {
  return mode === "light" ? "󰖙" : "󰖔"
}
