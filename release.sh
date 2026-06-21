#!/usr/bin/env zsh

set -e

# =========================================
# Params
# =========================================
# Usage: ./release.sh -version <version> [-publish true|false] [-zip true|false]
# Example: ./release.sh -version 0.1.0
#          ./release.sh -version 0.1.0 -publish true

VERSION=""
PUBLISH=false
CREATE_ZIP=true
PLUGIN_ID="lockblock"
BRANCH_BASE="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -version) VERSION="$2"; shift 2 ;;
    -publish) PUBLISH="$2"; shift 2 ;;
    -zip) CREATE_ZIP="$2"; shift 2 ;;
    *)
      echo "Unknown parameter: $1"
      echo "Usage: ./release.sh -version <version> [-publish true|false] [-zip true|false]"
      exit 1
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Missing required parameter: -version"
  echo "Usage: ./release.sh -version <version> [-publish true|false] [-zip true|false]"
  exit 1
fi

if [[ "$PUBLISH" != true && "$PUBLISH" != false ]]; then
  echo "-publish must be true or false"
  exit 1
fi

if [[ "$CREATE_ZIP" != true && "$CREATE_ZIP" != false ]]; then
  echo "-zip must be true or false"
  exit 1
fi

# =========================================
# Verify dependencies
# =========================================
DEPS=(jq npm)

if [[ "$PUBLISH" == true ]]; then
  DEPS+=(git)
fi

if [[ "$CREATE_ZIP" == true ]]; then
  DEPS+=(zip)
fi

for cmd in "${DEPS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd"
    exit 1
  fi
done

# =========================================
# Create or enter release branch
# =========================================
BRANCH_NAME="release/${VERSION}"

if [[ "$PUBLISH" == true ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Publish releases require a clean working tree. Commit or stash changes first."
    exit 1
  fi

  git fetch origin "$BRANCH_BASE"
  CURRENT_BRANCH=$(git branch --show-current)

  if [[ "$CURRENT_BRANCH" == "$BRANCH_NAME" ]]; then
    echo "Already on branch: $BRANCH_NAME"
  elif [[ "$CURRENT_BRANCH" == "$BRANCH_BASE" ]]; then
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
      git checkout "$BRANCH_NAME"
      echo "Checked out existing branch: $BRANCH_NAME"
    else
      git checkout -b "$BRANCH_NAME" "origin/$BRANCH_BASE"
      echo "Created branch: $BRANCH_NAME"
    fi
  else
    echo "Must run publish from $BRANCH_BASE or $BRANCH_NAME. Currently on: $CURRENT_BRANCH"
    exit 1
  fi

  if ! git merge-base --is-ancestor "origin/$BRANCH_BASE" HEAD; then
    echo "$BRANCH_NAME is behind origin/$BRANCH_BASE. Delete and recreate it, or merge origin/$BRANCH_BASE before publishing."
    exit 1
  fi
fi

# =========================================
# Update package.json
# =========================================
TMP=$(mktemp)
jq --arg v "$VERSION" '.version = $v' package.json > "$TMP"
mv "$TMP" package.json
echo "Updated package.json -> $VERSION"

# =========================================
# Update manifest.json
# =========================================
TMP=$(mktemp)
jq --arg v "$VERSION" '.version = $v' manifest.json > "$TMP"
mv "$TMP" manifest.json
echo "Updated manifest.json -> $VERSION"

# =========================================
# Update versions.json
# =========================================
MIN_APP_VERSION=$(jq -r '.minAppVersion' manifest.json)

if jq -e --arg v "$VERSION" 'has($v)' versions.json > /dev/null 2>&1; then
  echo "versions.json already has $VERSION - skipping."
else
  TMP=$(mktemp)
  jq --arg v "$VERSION" \
     --arg min "$MIN_APP_VERSION" \
     '. + {($v): $min}' \
     versions.json > "$TMP"
  mv "$TMP" versions.json
  echo "Updated versions.json -> $VERSION"
fi

# =========================================
# Validate and build
# =========================================
npm install
npm run lint:obsidian
npm run build
echo "Lint and build complete."

# =========================================
# Package local artifact
# =========================================
if [[ "$CREATE_ZIP" == true ]]; then
  mkdir -p "dist/${PLUGIN_ID}"
  cp main.js manifest.json styles.css "dist/${PLUGIN_ID}/"

  (
    cd dist
    zip -qr "${PLUGIN_ID}-${VERSION}.zip" "${PLUGIN_ID}"
  )

  echo "Created dist/${PLUGIN_ID}-${VERSION}.zip"
fi

if [[ "$PUBLISH" != true ]]; then
  echo ""
  echo "Local release build finished."
  echo "Run with -publish true to create and push a release branch."
  exit 0
fi

# =========================================
# Commit release branch
# =========================================
RELEASE_TRACKED_FILES=(package.json package-lock.json manifest.json versions.json)
STAGE_FILES=()

for file in "${RELEASE_TRACKED_FILES[@]}"; do
  if git check-ignore -q "$file"; then
    echo "Skipping ignored release file: $file"
  else
    STAGE_FILES+=("$file")
  fi
done

if [[ "${#STAGE_FILES[@]}" -gt 0 ]]; then
  git add "${STAGE_FILES[@]}"
fi

if git diff --cached --quiet; then
  echo "Nothing to commit - branch is unchanged."
else
  git commit -m "release: v${VERSION}"
fi

git push -u origin "$BRANCH_NAME"

git checkout "$BRANCH_BASE"
echo "Switched back to $BRANCH_BASE."

echo ""
echo "Branch pushed: $BRANCH_NAME"
echo ""
echo "Next steps:"
echo "  1. Open a PR from $BRANCH_NAME -> $BRANCH_BASE"
echo "  2. Merge the PR"
echo "  3. git pull origin $BRANCH_BASE"
echo ""
echo "The PR merge can build and publish the GitHub Release."
