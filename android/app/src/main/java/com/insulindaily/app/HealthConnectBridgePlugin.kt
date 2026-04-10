package com.insulindaily.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.time.Duration
import java.time.Instant

@CapacitorPlugin(name = "HealthConnectBridge")
class HealthConnectBridgePlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var permissionsLauncher: ActivityResultLauncher<Set<String>>? = null
    private var permissionCall: PluginCall? = null

    private val requiredPermissions =
        setOf(
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(OxygenSaturationRecord::class),
            HealthPermission.getReadPermission(BloodPressureRecord::class),
            HealthPermission.getReadPermission(SkinTemperatureRecord::class),
                )

    override fun load() {
        val activity = activity as? ComponentActivity ?: return
        permissionsLauncher =
            activity.registerForActivityResult(
                PermissionController.createRequestPermissionResultContract("com.google.android.apps.healthdata"),
            ) { granted: Set<String> ->
                val call = permissionCall ?: return@registerForActivityResult
                permissionCall = null
                val result =
                    JSObject().apply {
                        put("grantedPermissions", JSONArray(granted.toList()))
                        put("allGranted", granted.containsAll(requiredPermissions))
                    }
                call.resolve(result)
            }
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        pluginScope.launch {
            try {
                val status = buildStatus()
                call.resolve(status)
            } catch (error: Exception) {
                call.reject(error.message ?: "Unable to inspect Health Connect status.")
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        val launcher = permissionsLauncher
        if (launcher == null) {
            call.reject("Health Connect permission launcher is unavailable.")
            return
        }
        permissionCall = call
        launcher.launch(requiredPermissions)
    }

    @PluginMethod
    fun openHealthConnectSettings(call: PluginCall) {
        try {
            activity.startActivity(HealthConnectClient.getHealthConnectManageDataIntent(context))
            call.resolve(JSObject().apply { put("opened", true) })
        } catch (_: ActivityNotFoundException) {
            val providerPackage = "com.google.android.apps.healthdata"
            val uriString = "market://details?id=$providerPackage&url=healthconnect%3A%2F%2Fonboarding"
            try {
                activity.startActivity(
                    Intent(Intent.ACTION_VIEW).apply {
                        setPackage("com.android.vending")
                        data = Uri.parse(uriString)
                        putExtra("overlay", true)
                        putExtra("callerId", context.packageName)
                    },
                )
                call.resolve(JSObject().apply { put("opened", true) })
            } catch (error: Exception) {
                call.reject(error.message ?: "Unable to open Health Connect settings.")
            }
        }
    }

    @PluginMethod
    fun syncLatestVitals(call: PluginCall) {
        pluginScope.launch {
            try {
                val status = buildStatus()
                if (status.getString("sdkStatus") != "available") {
                    call.reject("Health Connect is not available on this device.")
                    return@launch
                }

                if (status.getBool("allPermissionsGranted") != true) {
                    call.reject("Health Connect permissions have not been granted yet.")
                    return@launch
                }

                val client = HealthConnectClient.getOrCreate(context)
                val endTime = Instant.now()
                val startTime = endTime.minus(Duration.ofDays(7))

                val latestHeartRate = readLatestHeartRate(client, startTime, endTime)
                val latestSpo2 = readLatestSpo2(client, startTime, endTime)
                val latestBloodPressure = readLatestBloodPressure(client, startTime, endTime)
                val latestSkinTemperature = readLatestSkinTemperature(client, startTime, endTime)

                val reading =
                    JSObject().apply {
                        put("sourcePlatform", "health-connect")
                        put("syncMode", "native-bridge")
                        put("heartRate", latestHeartRate)
                        put("spo2", latestSpo2)
                        put("systolic", latestBloodPressure.first)
                        put("diastolic", latestBloodPressure.second)
                        put("temperature", latestSkinTemperature)
                        put("responsiveness", "unknown")
                        put("fallDetected", false)
                        put("capturedAt", endTime.toString())
                    }

                val result =
                    JSObject().apply {
                        put("reading", reading)
                        put("status", status)
                    }
                call.resolve(result)
            } catch (error: Exception) {
                call.reject(error.message ?: "Unable to sync Health Connect vitals.")
            }
        }
    }

    private suspend fun buildStatus(): JSObject {
        val sdkStatus =
            when (HealthConnectClient.getSdkStatus(context)) {
                HealthConnectClient.SDK_AVAILABLE -> "available"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "provider_update_required"
                else -> "unavailable"
            }

        val status =
            JSObject().apply {
                put("sdkStatus", sdkStatus)
                put("providerPackage", "com.google.android.apps.healthdata")
                put("supportsHeartRate", true)
                put("supportsOxygenSaturation", true)
                put("supportsBloodPressure", true)
            }

        if (sdkStatus != "available") {
            status.put("supportsSkinTemperature", false)
            status.put("grantedPermissions", JSONArray())
            status.put("allPermissionsGranted", false)
            return status
        }

        val client = HealthConnectClient.getOrCreate(context)
        val granted = client.permissionController.getGrantedPermissions()
        val skinTemperatureAvailable =
            client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE) ==
                HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

        status.put("supportsSkinTemperature", skinTemperatureAvailable)
        status.put("grantedPermissions", JSONArray(granted.toList()))
        status.put(
            "allPermissionsGranted",
            granted.containsAll(requiredPermissions.filterNot {
                it == HealthPermission.getReadPermission(SkinTemperatureRecord::class) && !skinTemperatureAvailable
            }.toSet()),
        )
        return status
    }

    private suspend fun readLatestHeartRate(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
    ): Double? {
        val response =
            client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    pageSize = 1,
                    ascendingOrder = false,
                ),
            )
        val record = response.records.firstOrNull() ?: return null
        val sample = record.samples.maxByOrNull { it.time } ?: return null
        return sample.beatsPerMinute.toDouble()
    }

    private suspend fun readLatestSpo2(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
    ): Double? {
        val response =
            client.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    pageSize = 1,
                    ascendingOrder = false,
                ),
            )
        return response.records.firstOrNull()?.percentage?.value
    }

    private suspend fun readLatestBloodPressure(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
    ): Pair<Double?, Double?> {
        val response =
            client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodPressureRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    pageSize = 1,
                    ascendingOrder = false,
                ),
            )
        val record = response.records.firstOrNull() ?: return Pair(null, null)
        return Pair(record.systolic.inMillimetersOfMercury, record.diastolic.inMillimetersOfMercury)
    }

    private suspend fun readLatestSkinTemperature(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
    ): Double? {
        val available =
            client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE) ==
                HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        if (!available) return null

        val response =
            client.readRecords(
                ReadRecordsRequest(
                    recordType = SkinTemperatureRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    pageSize = 1,
                    ascendingOrder = false,
                ),
            )

        val record = response.records.firstOrNull() ?: return null
        return record.baseline?.inFahrenheit
    }
}
