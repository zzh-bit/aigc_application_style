plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ps2.shell"
    compileSdk = 35
    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.ps2.shell"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "2.0"
        // 与 lib/api-client.ts 中 PS2_LOOPBACK_PROXY_PORT 保持一致；换服务器时改 IPv4。
        buildConfigField("String", "PS2_API_FORWARD_HOST", "\"api.wdzsyyh.cloud\"")
        buildConfigField("String", "PS2_API_PINNED_IPV4", "\"154.12.28.62\"")
        buildConfigField("int", "PS2_LOOPBACK_PROXY_PORT", "37123")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
