"use strict";

const STORAGE_KEY = "smt.entries.v3";
const DRAFT_KEY = "smt.drafts.v3";
const PHOTO_KEY = "smt.photos.v3";
const SETTINGS_KEY = "smt.settings.v3";
const TOUR_KEY = "smt.tour.complete.v3";
const MAX_LOCAL_PHOTOS = 16;

const DEFAULT_SETTINGS = {
  theme: "light",
  textSize: "normal",
  highContrast: false,
  reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
  readableFont: false,
  largeTargets: false,
  reduceClutter: false,
  defaultMilk: "",
  defaultSweetness: "",
  defaultSize: "",
  defaultAddOns: "",
  tourComplete: false,
  earnedAchievements: {},
};

const RATING_WORDS = ["Not for me", "Disappointing", "Pretty good", "Really good", "Favorite-worthy"];

const TOUR_STEPS = [
  { icon: "🍓", title: "Welcome to your matcha scrapbook", body: "This is a personal record of the drinks, cafes, and little moments you want to remember." },
  { icon: "📷", title: "Start with one photo", body: "Tap Log a Matcha and the camera opens first. Retake it until the memory looks right, or choose one from your camera roll." },
  { icon: "⌖", title: "Confirm the place", body: "We use photo GPS or your current location to suggest one likely cafe. You confirm it, or choose another." },
  { icon: "🍓🍓🍓", title: "Three things make a finished log", body: "A photo, a place, and a 1–5 strawberry rating are all you need. Drink, visit, and thought details can wait." },
  { icon: "♡", title: "Let your history guide you", body: "Places, the personal map, achievements, drafts, defaults, and accessibility settings all grow from the memories you log." },
];

const ACHIEVEMENT_DEFINITIONS = [
  { id: "first-sip", name: "First Sip", icon: "🍓", description: "Log your first matcha.", difficulty: "Easy", metric: (c) => c.total, target: 1, progress: (c) => `${Math.min(c.total, 1)} / 1 matcha` },
  { id: "getting-started", name: "Getting Started", icon: "📓", description: "Log 5 matchas.", difficulty: "Easy", metric: (c) => c.total, target: 5, progress: (c) => `${Math.min(c.total, 5)} / 5 matchas` },
  { id: "matcha-regular", name: "Matcha Regular", icon: "🍵", description: "Log 10 matchas.", difficulty: "Easy", metric: (c) => c.total, target: 10, progress: (c) => `${Math.min(c.total, 10)} / 10 matchas` },
  { id: "strawberry-scholar", name: "Strawberry Scholar", icon: "📚", description: "Log 25 matchas.", difficulty: "Medium", metric: (c) => c.total, target: 25, progress: (c) => `${Math.min(c.total, 25)} / 25 matchas` },
  { id: "matcha-historian", name: "Matcha Historian", icon: "🗂️", description: "Log 50 matchas.", difficulty: "Hard", metric: (c) => c.total, target: 50, progress: (c) => `${Math.min(c.total, 50)} / 50 matchas` },
  { id: "the-archive", name: "The Archive", icon: "🗃️", description: "Log 100 matchas.", difficulty: "Legendary", metric: (c) => c.total, target: 100, progress: (c) => `${Math.min(c.total, 100)} / 100 matchas` },
  { id: "first-stop", name: "First Stop", icon: "📍", description: "Visit your first cafe.", difficulty: "Easy", metric: (c) => c.placeCount, target: 1, progress: (c) => `${Math.min(c.placeCount, 1)} / 1 place` },
  { id: "neighborhood-explorer", name: "Neighborhood Explorer", icon: "🗺️", description: "Log matchas from 5 different places.", difficulty: "Easy", metric: (c) => c.placeCount, target: 5, progress: (c) => `${Math.min(c.placeCount, 5)} / 5 places` },
  { id: "cafe-hopper", name: "Cafe Hopper", icon: "🚶", description: "Visit 10 different places.", difficulty: "Medium", metric: (c) => c.placeCount, target: 10, progress: (c) => `${Math.min(c.placeCount, 10)} / 10 places` },
  { id: "matcha-cartographer", name: "Matcha Cartographer", icon: "🧭", description: "Visit 25 different places.", difficulty: "Hard", metric: (c) => c.placeCount, target: 25, progress: (c) => `${Math.min(c.placeCount, 25)} / 25 places` },
  { id: "frequent-flyer", name: "Frequent Flyer", icon: "🎟️", description: "Log 5 visits to the same place.", difficulty: "Medium", metric: (c) => c.maxVisits, target: 5, progress: (c) => `${Math.min(c.maxVisits, 5)} / 5 visits` },
  { id: "house-regular", name: "House Regular", icon: "🏠", description: "Log 10 visits to the same place.", difficulty: "Hard", metric: (c) => c.maxVisits, target: 10, progress: (c) => `${Math.min(c.maxVisits, 10)} / 10 visits` },
  { id: "found-a-keeper", name: "Found a Keeper", icon: "💗", description: "Have a place qualify as a Favorite Place suggestion.", difficulty: "Medium", metric: (c) => c.favoritePlaceCount, target: 1, progress: (c) => `${Math.min(c.favoritePlaceCount, 1)} / 1 suggestion` },
  { id: "not-going-back", name: "Not Going Back", icon: "🚫", description: "Have a place qualify as a Do Not Visit suggestion.", difficulty: "Medium", metric: (c) => c.avoidPlaceCount, target: 1, progress: (c) => `${Math.min(c.avoidPlaceCount, 1)} / 1 suggestion` },
  { id: "five-strawberry-find", name: "Five-Strawberry Find", icon: "✨", description: "Give your first 5-strawberry rating.", difficulty: "Easy", metric: (c) => c.fiveRatings, target: 1, progress: (c) => `${Math.min(c.fiveRatings, 1)} / 1 five` },
  { id: "three-in-a-row", name: "Three in a Row", icon: "🎀", description: "Rate 3 consecutive matchas 4 strawberries or higher.", difficulty: "Medium", metric: (c) => c.highRatingStreak, target: 3, progress: (c) => `${Math.min(c.highRatingStreak, 3)} / 3 in a row` },
  { id: "golden-streak", name: "Golden Streak", icon: "🌟", description: "Rate 5 consecutive matchas 4 strawberries or higher.", difficulty: "Hard", metric: (c) => c.highRatingStreak, target: 5, progress: (c) => `${Math.min(c.highRatingStreak, 5)} / 5 in a row` },
  { id: "worth-another-sip", name: "Worth Another Sip", icon: "↻", description: "Mark would-order-again on 10 matchas.", difficulty: "Medium", metric: (c) => c.orderAgainYes, target: 10, progress: (c) => `${Math.min(c.orderAgainYes, 10)} / 10 yes` },
  { id: "reliable-taste", name: "Reliable Taste", icon: "✓", description: "Keep a 4.0+ average across at least 20 matchas.", difficulty: "Hard", metric: (c) => (c.total >= 20 && c.average >= 4 ? 1 : 0), target: 1, progress: (c) => c.total < 20 ? `${c.total} / 20 matchas` : `${c.average.toFixed(1)} / 4.0 average` },
  { id: "memory-keeper", name: "Memory Keeper", icon: "✎", description: "Add optional details to 10 matcha entries.", difficulty: "Easy", metric: (c) => c.enrichedCount, target: 10, progress: (c) => `${Math.min(c.enrichedCount, 10)} / 10 detailed` },
  { id: "full-scrapbook-page", name: "Full Scrapbook Page", icon: "📝", description: "Complete every optional detail group on one entry.", difficulty: "Easy", metric: (c) => c.fullDetailCount, target: 1, progress: (c) => `${Math.min(c.fullDetailCount, 1)} / 1 full page` },
  { id: "documentarian", name: "Documentarian", icon: "📸", description: "Log 25 matchas with photos.", difficulty: "Medium", metric: (c) => c.photoCount, target: 25, progress: (c) => `${Math.min(c.photoCount, 25)} / 25 photos` },
  { id: "fresh-finds", name: "Fresh Finds", icon: "🌱", description: "Log 3 first-time places within 30 days.", difficulty: "Medium", metric: (c) => c.freshPlaceCount, target: 3, progress: (c) => `${Math.min(c.freshPlaceCount, 3)} / 3 new places` },
  { id: "community-contributor", name: "Community Contributor", icon: "🌍", description: "Publish 10 matchas.", difficulty: "Medium", metric: (c) => c.publishedCount, target: 10, progress: (c) => `${Math.min(c.publishedCount, 10)} / 10 published` },
  { id: "strawberry-matcha-master", name: "Strawberry Matcha Master", icon: "👑", description: "Log 100 matchas, visit 25 places, and earn 15 other achievements.", difficulty: "Legendary", metric: (c) => (c.total >= 100 && c.placeCount >= 25 && c.otherEarned >= 15 ? 1 : 0), target: 1, progress: (c) => `${Math.min(c.total, 100)}/100 · ${Math.min(c.placeCount, 25)}/25 places · ${Math.min(c.otherEarned, 15)}/15 badges` },
];

const state = {
  user: null,
  cloudAvailable: false,
  entries: [],
  drafts: [],
  communityEntries: [],
  activeView: "home",
  expandedEntryId: null,
  editingEntryId: null,
  editRating: null,
  editPhotoData: null,
  lastSavedEntryId: null,
  currentDraft: null,
  selectedPhotoData: null,
  selectedPhotoGps: null,
  selectedPhotoSource: null,
  suggestedPlace: null,
  selectedPlace: null,
  selectedRating: 0,
  placePinMap: null,
  placePinMarker: null,
  personalMap: null,
  personalMarkerLayer: null,
  communityMarkerLayer: null,
  userMarker: null,
  showCommunityLayer: false,
  tourIndex: 0,
  settings: { ...DEFAULT_SETTINGS },
  settingsSyncTimer: null,
  draftSyncTimer: null,
  placeGroups: [],
};

const $ = (id) => document.getElementById(id);

const APP_MODULES = [
  "/app-events.js",
  "/app-data.js",
  "/app-memories.js",
  "/app-places.js",
  "/app-profile.js",
  "/app-drafts.js",
  "/app-capture.js",
  "/app-log-save.js",
  "/app-settings.js",
  "/app-utils.js",
  "/quick-wins.js",
  "/quick-wins-archive-fix.js"
];

(async function loadScrapbookApp() {
  try {
    for (const src of APP_MODULES) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.appendChild(script);
      });
    }
    state.settings = loadLocalSettings();
    await init();
  } catch (error) {
    console.error("Strawberry Matcha app failed to start", error);
    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = "The scrapbook could not finish loading. Refresh and try again.";
      toast.classList.add("is-visible");
    }
  }
})();