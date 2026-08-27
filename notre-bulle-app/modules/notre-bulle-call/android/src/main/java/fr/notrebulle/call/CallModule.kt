package fr.notrebulle.call

import android.app.PictureInPictureParams
import android.util.Rational
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * État partagé JS ↔ MainActivity :
 * quand `enabled` est true et que l'utilisateur quitte l'app pendant un
 * appel vidéo, `onUserLeaveHint` (injecté dans MainActivity par le plugin
 * plugins/with-pip.js) entre automatiquement en Picture-in-Picture —
 * comme WhatsApp. Le drapeau est posé AVANT la mise en pause de
 * l'activité, ce qui est le seul moment où Android accepte le PiP.
 */
object CallPipState {
  @Volatile
  var enabled: Boolean = false
}

class CallModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotreBulleCall")

    // Active/désactive le PiP automatique au départ de l'app.
    // JS l'active pendant un appel vidéo connecté, le désactive sinon.
    Function("setAutoPip") { enabled: Boolean ->
      CallPipState.enabled = enabled
      enabled
    }

    // Entre manuellement en Picture-in-Picture (fenêtre flottante au-dessus
    // des autres applis). Retourne true si l'entrée en PiP a réussi.
    Function("enterPip") {
      val activity = appContext.currentActivity ?: return@Function false
      return@Function try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !activity.inPictureInPictureModeCompat()) {
          false
        } else {
          val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(9, 16))
            .build()
          activity.enterPictureInPictureMode(params)
        }
      } catch (e: Exception) {
        false
      }
    }
  }
}

// Petit helper : vérifie que le PiP est disponible sur cette activité
private fun android.app.Activity.inPictureInPictureModeCompat(): Boolean {
  return packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)
}
