const statusText = document.querySelector("#status-text");
const profile = document.querySelector("#profile");
const profilePicture = document.querySelector("#profile-picture");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const signedOutActions = document.querySelector("#signed-out-actions");
const signedInActions = document.querySelector("#signed-in-actions");

loadSession();

async function loadSession() {
  try {
    const response = await fetch("/api/me", {
      headers: { accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      showSignedOut();
      return;
    }

    const data = await response.json();
    if (!data.authenticated || !data.user) {
      showSignedOut();
      return;
    }

    showSignedIn(data.user);
  } catch {
    statusText.textContent = "Could not check sign-in status. You can still try signing in.";
    signedOutActions.classList.remove("hidden");
  }
}

function showSignedOut() {
  statusText.textContent = "Ready for Google sign-in.";
  profile.classList.add("hidden");
  signedOutActions.classList.remove("hidden");
  signedInActions.classList.add("hidden");
}

function showSignedIn(user) {
  statusText.textContent = "Google sign-in is working.";
  profileName.textContent = user.name || "Signed-in user";
  profileEmail.textContent = user.email || "";

  if (user.picture) {
    profilePicture.src = user.picture;
    profilePicture.alt = `${user.name || "User"} profile picture`;
    profilePicture.hidden = false;
  } else {
    profilePicture.removeAttribute("src");
    profilePicture.alt = "";
    profilePicture.hidden = true;
  }

  profile.classList.remove("hidden");
  signedOutActions.classList.add("hidden");
  signedInActions.classList.remove("hidden");
}
