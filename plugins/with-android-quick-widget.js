const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const WIDGET_CLASS_NAME = '.ZeroTallyWidgetProvider';

const WIDGET_KOTLIN_SOURCE = `package com.keepaccounts.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import java.io.File
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ZeroTally Android 桌面小组件（4x2）：
 * - 直接只读访问本地 SQLite（keep_accounts.db）实时呈现当月净支出与收入；
 * - 自动遵循隐私设置中 hideAmountsByDefault 脱敏策略；
 * - 点击「+ 记一笔」通过 Deep Link 直达 keep-accounts://record，点击卡片进入明细首页，点击刷新即刻重读。
 */
class ZeroTallyWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    for (widgetId in appWidgetIds) {
      updateWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ZeroTallyWidgetProvider::class.java))
      for (widgetId in ids) {
        updateWidget(context, manager, widgetId)
      }
    }
  }

  private data class WidgetSummary(
    val monthLabel: String,
    val expenseText: String,
    val incomeText: String
  )

  private fun updateWidget(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int
  ) {
    val views = RemoteViews(context.packageName, R.layout.widget_zerotally_summary)
    val summary = readMonthlySummary(context)

    views.setTextViewText(R.id.widget_title, "ZeroTally · " + summary.monthLabel)
    views.setTextViewText(R.id.widget_expense_value, summary.expenseText)
    views.setTextViewText(R.id.widget_income_value, summary.incomeText)

    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }

    // 点击主体打开应用首页
    val openHomeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("keep-accounts://")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openHomePending = PendingIntent.getActivity(context, 1001, openHomeIntent, pendingFlags)
    views.setOnClickPendingIntent(R.id.widget_root, openHomePending)

    // 点击「+ 记一笔」直达记账页
    val recordIntent = Intent(Intent.ACTION_VIEW, Uri.parse("keep-accounts://record")).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val recordPending = PendingIntent.getActivity(context, 1002, recordIntent, pendingFlags)
    views.setOnClickPendingIntent(R.id.widget_record_btn, recordPending)

    // 点击刷新按钮即刻更新小组件数字
    val refreshIntent = Intent(context, ZeroTallyWidgetProvider::class.java).apply {
      action = ACTION_REFRESH
    }
    val refreshPending = PendingIntent.getBroadcast(context, 1003, refreshIntent, pendingFlags)
    views.setOnClickPendingIntent(R.id.widget_refresh_btn, refreshPending)

    appWidgetManager.updateAppWidget(appWidgetId, views)
  }

  private fun readMonthlySummary(context: Context): WidgetSummary {
    val now = Date()
    val monthKey = SimpleDateFormat("yyyy-MM", Locale.US).format(now)
    val monthLabel = SimpleDateFormat("M月概览", Locale.CHINA).format(now)

    val candidateFiles = listOf(
      File(File(context.filesDir, "SQLite"), "keep_accounts.db"),
      context.getDatabasePath("keep_accounts.db")
    )
    val dbFile = candidateFiles.firstOrNull { it.exists() && it.isFile }
      ?: return WidgetSummary(monthLabel, "¥0.00", "¥0.00")

    var db: SQLiteDatabase? = null
    return try {
      db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)

      var hideAmounts = false
      db.rawQuery(
        "SELECT value FROM app_settings WHERE key = ?",
        arrayOf("privacy_security_config_v1")
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          val raw = cursor.getString(0) ?: ""
          if (raw.contains("\\"hideAmountsByDefault\\":true")) {
            hideAmounts = true
          }
        }
      }

      if (hideAmounts) {
        return WidgetSummary(monthLabel, "••••", "••••")
      }

      val startDate = "$monthKey-01"
      val endDate = "$monthKey-31"
      var expenseCents = 0L
      var incomeCents = 0L

      db.rawQuery(
        """
        SELECT
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents ELSE 0 END), 0) AS net_expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS total_income
        FROM transactions
        WHERE occurred_on >= ? AND occurred_on <= ?
        """.trimIndent(),
        arrayOf(startDate, endDate)
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          expenseCents = cursor.getLong(0)
          incomeCents = cursor.getLong(1)
        }
      }

      WidgetSummary(
        monthLabel = monthLabel,
        expenseText = formatCents(expenseCents),
        incomeText = formatCents(incomeCents)
      )
    } catch (_: Throwable) {
      WidgetSummary(monthLabel, "¥0.00", "¥0.00")
    } finally {
      try {
        db?.close()
      } catch (_: Throwable) {
      }
    }
  }

  private fun formatCents(cents: Long): String {
    val formatter = DecimalFormat("#,##0.00")
    val negative = cents < 0L
    val yuan = kotlin.math.abs(cents) / 100.0
    return (if (negative) "-¥" else "¥") + formatter.format(yuan)
  }

  companion object {
    const val ACTION_REFRESH = "com.keepaccounts.app.ACTION_WIDGET_REFRESH"
  }
}
`;

const WIDGET_BG_DRAWABLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#014D36" />
    <corners android:radius="20dp" />
</shape>
`;

const WIDGET_BTN_BG_DRAWABLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#FFFFFF" />
    <corners android:radius="999dp" />
</shape>
`;

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_zerotally_bg"
    android:orientation="vertical"
    android:padding="16dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:gravity="center_vertical"
        android:orientation="horizontal">

        <TextView
            android:id="@+id/widget_title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:ellipsize="end"
            android:maxLines="1"
            android:text="ZeroTally · 本月概览"
            android:textColor="#B7E4D3"
            android:textSize="12sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/widget_refresh_btn"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginEnd="8dp"
            android:paddingHorizontal="6dp"
            android:paddingVertical="4dp"
            android:text="刷新"
            android:textColor="#B7E4D3"
            android:textSize="11sp" />

        <TextView
            android:id="@+id/widget_record_btn"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/widget_zerotally_btn_bg"
            android:paddingHorizontal="12dp"
            android:paddingVertical="5dp"
            android:text="+ 记一笔"
            android:textColor="#017853"
            android:textSize="12sp"
            android:textStyle="bold" />
    </LinearLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_marginTop="12dp"
        android:layout_weight="1"
        android:gravity="bottom"
        android:orientation="horizontal">

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="本月支出"
                android:textColor="#B7E4D3"
                android:textSize="11sp" />

            <TextView
                android:id="@+id/widget_expense_value"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginTop="2dp"
                android:ellipsize="end"
                android:maxLines="1"
                android:text="¥0.00"
                android:textColor="#FFFFFF"
                android:textSize="20sp"
                android:textStyle="bold" />
        </LinearLayout>

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="本月收入"
                android:textColor="#B7E4D3"
                android:textSize="11sp" />

            <TextView
                android:id="@+id/widget_income_value"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginTop="2dp"
                android:ellipsize="end"
                android:maxLines="1"
                android:text="¥0.00"
                android:textColor="#FFFFFF"
                android:textSize="20sp"
                android:textStyle="bold" />
        </LinearLayout>
    </LinearLayout>
</LinearLayout>
`;

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:initialLayout="@layout/widget_zerotally_summary"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:resizeMode="horizontal"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:widgetCategory="home_screen" />
`;

function writeFileEnsuringDir(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Expo Config Plugin：零三方重型依赖注入 ZeroTally Android 桌面小组件（Widget）。
 */
function withAndroidQuickWidget(config) {
  const withFiles = withDangerousMod(config, [
    'android',
    async (mod) => {
      const mainRoot = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main');
      writeFileEnsuringDir(
        path.join(mainRoot, 'java', 'com', 'keepaccounts', 'app', 'ZeroTallyWidgetProvider.kt'),
        WIDGET_KOTLIN_SOURCE
      );
      writeFileEnsuringDir(
        path.join(mainRoot, 'res', 'drawable', 'widget_zerotally_bg.xml'),
        WIDGET_BG_DRAWABLE_XML
      );
      writeFileEnsuringDir(
        path.join(mainRoot, 'res', 'drawable', 'widget_zerotally_btn_bg.xml'),
        WIDGET_BTN_BG_DRAWABLE_XML
      );
      writeFileEnsuringDir(
        path.join(mainRoot, 'res', 'layout', 'widget_zerotally_summary.xml'),
        WIDGET_LAYOUT_XML
      );
      writeFileEnsuringDir(
        path.join(mainRoot, 'res', 'xml', 'zerotally_widget_info.xml'),
        WIDGET_INFO_XML
      );
      return mod;
    },
  ]);

  return withAndroidManifest(withFiles, (mod) => {
    const appNode = mod.modResults.manifest.application?.[0];
    if (!appNode) {
      return mod;
    }
    if (!Array.isArray(appNode.receiver)) {
      appNode.receiver = [];
    }
    const alreadyExists = appNode.receiver.some(
      (item) => item?.$?.['android:name'] === WIDGET_CLASS_NAME
    );
    if (!alreadyExists) {
      appNode.receiver.push({
        $: {
          'android:name': WIDGET_CLASS_NAME,
          'android:exported': 'true',
          'android:label': 'ZeroTally 记账小组件',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
              { $: { 'android:name': 'com.keepaccounts.app.ACTION_WIDGET_REFRESH' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/zerotally_widget_info',
            },
          },
        ],
      });
    }
    return mod;
  });
}

module.exports = withAndroidQuickWidget;
