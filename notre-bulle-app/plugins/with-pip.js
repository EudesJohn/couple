// ============================================================
// Config plugin — Picture-in-Picture pour les appels vidéo
// 1. Manifest : android:supportsPictureInPicture="true" sur la
//    MainActivity (requis par Android pour autoriser le PiP).
// 2. MainActivity : override onUserLeaveHint() → si un appel vidéo
//    est en cours (drapeau posé par le module natif NotreBulleCall),
//    l'app passe en fenêtre flottante au-dessus des autres applis,
//    comme WhatsApp.
// ============================================================
const { withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const ON_USER_LEAVE_HINT = `
  // === Notre Bulle — PiP automatique pendant les appels vidéo ===
  // Injecté par plugins/with-pip.js. Appelé AVANT la mise en pause de
  // l'activité : c'est le seul moment où Android accepte le PiP.
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (fr.notrebulle.call.CallPipState.enabled) {
      try {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          val params = android.app.PictureInPictureParams.Builder()
            .setAspectRatio(android.util.Rational(9, 16))
            .build()
          enterPictureInPictureMode(params)
        }
      } catch (_: Exception) {
      }
    }
  }
`;

function injectOnUserLeaveHint(contents) {
  if (contents.includes('onUserLeaveHint')) return contents; // déjà injecté

  // Insérer avant la dernière accolade fermante de la classe
  const lastBrace = contents.lastIndexOf('}');
  if (lastBrace === -1) {
    console.warn('⚠️ with-pip: structure MainActivity inattendue, injection ignorée');
    return contents;
  }
  return (
    contents.slice(0, lastBrace).replace(/\s*$/, '\n') +
    ON_USER_LEAVE_HINT +
    '\n}\n'
  );
}

const withPip = (config) => {
  // 1. Manifest — autoriser le PiP sur la MainActivity
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) return modConfig;

    const activities = application.activity || [];
    const mainActivity = activities.find(
      (a) => a.$ && (a.$['android:name'] || '').endsWith('.MainActivity')
    );

    if (mainActivity) {
      mainActivity.$['android:supportsPictureInPicture'] = 'true';
      mainActivity.$['android:configChanges'] =
        'keyboard|keyboardHidden|orientation|screenSize|screenLayout|smallestScreenSize|uiMode';
      console.log('✅ with-pip: supportsPictureInPicture activé sur MainActivity');
    } else {
      console.warn('⚠️ with-pip: MainActivity introuvable dans le manifest');
    }

    return modConfig;
  });

  // 2. MainActivity — entrer en PiP quand l'utilisateur quitte l'app en appel
  config = withMainActivity(config, (modConfig) => {
    try {
      modConfig.modResults.contents = injectOnUserLeaveHint(modConfig.modResults.contents);
      console.log('✅ with-pip: onUserLeaveHint injecté dans MainActivity');
    } catch (err) {
      console.warn('⚠️ with-pip: échec injection MainActivity:', err?.message);
    }
    return modConfig;
  });

  return config;
};

module.exports = withPip;
