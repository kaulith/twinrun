plugins {
    id("com.android.application")
}

android {
    namespace = "com.northwind.orders"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.northwind.orders"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}
