#!/usr/bin/env bash
# The files this example copies from dembrane's frontend, and where they go.
#
#   scripts/echo-files.sh copy   copy echo's files we don't have yet, at ECHO_REF
#                                (FORCE=1 overwrites ours, edits and all)
#   scripts/echo-files.sh diff   show how our copies differ from echo's
#
# ECHO_DIR is a dembrane-echo checkout (default ~/repos/dembrane-echo), and
# ECHO_REF a commit in it (default: the one in scripts/echo-ref). Files are
# read with `git show`, so the checkout's branch doesn't matter.
set -euo pipefail

cd "$(dirname "$0")/.."
ECHO_DIR="${ECHO_DIR:-$HOME/repos/dembrane-echo}"
ECHO_REF="${ECHO_REF:-$(cat scripts/echo-ref)}"
SRC=dembrane/frontend
DEST=src/client/dembrane

# echo's path (under dembrane/frontend) → ours. A bare src/ path keeps its
# place under src/client/dembrane/.
FILES=(
  "tailwind.config.js tailwind.config.js"
  "src/colors.ts"
  "src/theme.tsx"
  "src/index.css"
  "src/fonts/dm-sans.css"
  "src/fonts/dm-sans-variable.woff2"
  "src/styles/rules.css"
  "src/styles/joined.css"
  "src/styles/tokens-dark.css"
  "src/styles/button.module.css"
  "src/assets/dembrane-logo-new.svg"
  "src/assets/dembrane-logo-new-dark.svg"
  "src/assets/logomark-no-bg.svg"
  "src/assets/logomark-no-bg-dark.svg"
  "src/hooks/useAppPreferences.tsx"
  "src/lib/utils.ts"
  "src/lib/testUtils.ts"
  "src/assets/aiconl-logo.png"
  "src/assets/aiconl-logo-hq.png"
  "src/components/common/Logo.tsx"
  "src/components/common/Toaster.tsx"
  "src/components/common/Markdown.tsx"
  "src/components/common/RedactedText.tsx"
  "src/components/voice/voiceInput.ts"
  "src/components/voice/VoiceWaveform.tsx"
  "src/components/participant/ParticipantRecordingWaveform.tsx"
  "src/components/participant/SpikeMessage.tsx"
  "src/components/participant/SystemMessage.tsx"
  "src/components/participant/StopRecordingConfirmationModal.tsx"
  "src/components/participant/ParticipantOnboardingCards.tsx"
  "src/components/participant/ParticipantOnboardingCards.css"
  "src/components/participant/hooks/useOnboardingCards.ts"
  "src/components/participant/ParticipantInitiateForm.tsx"
  "src/components/participant/recordingCap.ts"
  "src/components/participant/ParticipantSettingsModal.tsx"
  "src/components/participant/MicrophoneTest.tsx"
  "src/components/layout/ParticipantLayout.tsx"
  "src/components/layout/ParticipantHeader.tsx"
  "src/lib/visitorId.ts"
  "src/components/participant/ParticipantBody.tsx"
  "src/components/participant/UserChunkMessage.tsx"
  "src/components/common/TipBanner.tsx"
  "src/hooks/useOnlineStatus.ts"
  "src/routes/participant/ParticipantPostConversation.tsx"
  "src/components/participant/refine/RefineSelection.tsx"
  "src/components/participant/refine/hooks/useRefineSelectionCooldown.ts"
  "src/components/participant/verify/hooks/index.ts"
  "src/components/participant/verify/VerifySelection.tsx"
  "src/components/participant/verify/VerifyInstructions.tsx"
  "src/components/participant/verify/VerifyArtefact.tsx"
  "src/components/participant/verify/VerifyArtefactError.tsx"
  "src/components/participant/verify/VerifyArtefactLoading.tsx"
  "src/components/participant/verify/VerifiedArtefactsList.tsx"
  "src/components/participant/verify/VerifiedArtefactItem.tsx"
  "src/components/participant/verify/ArtefactModal.tsx"
  "src/components/form/MarkdownWYSIWYG/MarkdownWYSIWYG.tsx"
  "src/components/form/MarkdownWYSIWYG/styles.css"
  "src/hooks/useCooldown.ts"
)

target() {
  local from="$1" to="${2:-}"
  if [[ -n "$to" ]]; then echo "$to"; else echo "$DEST/${from#src/}"; fi
}

case "${1:-}" in
  copy)
    for entry in "${FILES[@]}"; do
      read -r from to <<<"$entry"
      out="$(target "$from" "$to")"
      [[ -e "$out" && -z "${FORCE:-}" ]] && continue
      mkdir -p "$(dirname "$out")"
      git -C "$ECHO_DIR" show "$ECHO_REF:$SRC/$from" >"$out"
      echo "$from → $out"
    done
    ;;
  diff)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    for entry in "${FILES[@]}"; do
      read -r from to <<<"$entry"
      out="$(target "$from" "$to")"
      git -C "$ECHO_DIR" show "$ECHO_REF:$SRC/$from" >"$tmp/echo"
      diff -u --label "echo/$from" --label "$out" "$tmp/echo" "$out" || true
    done
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac
