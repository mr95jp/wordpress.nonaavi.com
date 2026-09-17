// 症状別ハブ。記事の所属と並び順はここだけで管理する（docs/site-design.md §2）。
// rows は docs/symptoms.md の「見えているものから引く」をハブごとに切り分けたもの。

export type HubRow = { see: string; suspect: string; slug: string };

export type Hub = {
  id: string;
  label: string; // トップのボタン・パンくず
  title: string; // H1
  seoTitle: string;
  description: string;
  lead: string;
  articles: string[];
  rows: HubRow[];
};

export const HUBS: Hub[] = [
  {
    id: 'error-screen',
    label: '真っ白・エラー画面が出る',
    title: 'WordPress が真っ白・エラー画面になったとき',
    seoTitle: 'WordPress 真っ白・エラー画面｜症状から探す',
    description:
      'WordPressが真っ白、「重大なエラー」、500エラー、データベース接続確立エラー、メンテナンス中が消えない。画面の見え方と直前にやったことから原因の記事へ案内します。',
    lead: '白画面は「エラーが出ていない」状態ではありません。エラーは出ているのに表示しない設定になっているだけです。まず見えている画面と、直前にやったことを確認してください。',
    articles: [
      'php-upgrade-white-screen',
      'plugin-conflict-diagnosis',
      'functions-php-broken-recovery',
      'admin-only-white-screen',
      'htaccess-500-rewrite-loop',
      'db-connection-error-diagnosis',
      'maintenance-mode-stuck',
      'php7-to-php8-breaking-changes',
    ],
    rows: [
      { see: '真っ白で何も出ない', suspect: 'Fatal error + display_errors が Off', slug: 'php-upgrade-white-screen' },
      { see: '「このサイトで重大なエラーが発生しました。」', suspect: 'テーマかプラグインの Fatal', slug: 'functions-php-broken-recovery' },
      { see: 'プラグインを更新したら壊れた', suspect: 'プラグイン同士の競合', slug: 'plugin-conflict-diagnosis' },
      { see: '管理画面だけ真っ白（フロントは正常）', suspect: '管理画面でだけ動くコードの Fatal', slug: 'admin-only-white-screen' },
      { see: '500 Internal Server Error', suspect: '.htaccess か PHP', slug: 'htaccess-500-rewrite-loop' },
      { see: '「データベース接続確立エラー」', suspect: '認証情報・ホスト名・DB 名・MySQL 停止・接続数', slug: 'db-connection-error-diagnosis' },
      { see: '「メンテナンスのためしばらく利用できません」が消えない', suspect: '.maintenance の残留', slug: 'maintenance-mode-stuck' },
      { see: 'エラーは出ないが数字や分岐がおかしい', suspect: 'PHP 8 で == の比較結果が変わった', slug: 'php7-to-php8-breaking-changes' },
    ],
  },
  {
    id: 'cannot-login',
    label: 'ログイン・管理画面に入れない',
    title: 'WordPress にログインできない・管理画面に入れないとき',
    seoTitle: 'WordPress ログインできない｜症状から探す',
    description:
      'パスワードは合っているのにログインできない、ログイン画面に戻される、リダイレクトが多すぎます、SiteGuardでロックされた、権限がありません。症状別に原因の記事へ案内します。',
    lead: 'ログインできない原因は Cookie・URL 設定・メール・Fatal の 4 パターンにほぼ分かれます。まず、どの画面で止まっているかを確認してください。',
    articles: [
      'login-impossible',
      'siteguard-lockout',
      'redirect-loop',
      'wp-admin-403-capability',
      'recovery-without-wp-cli',
    ],
    rows: [
      { see: 'パスワードは合っているのにログイン画面に戻される', suspect: 'Cookie・URL 設定・メール・Fatal', slug: 'login-impossible' },
      { see: 'サイトは見えるのに管理画面に入れない', suspect: 'サイト URL の設定ミス', slug: 'login-impossible' },
      { see: 'wp-login.php が 404 / LOGIN LOCKED', suspect: 'SiteGuard のログイン URL 変更・ロック', slug: 'siteguard-lockout' },
      { see: '「リダイレクトが多すぎます」', suspect: 'SSL 強制の重複・WP_HOME と WP_SITEURL の不一致', slug: 'redirect-loop' },
      { see: '「このページにアクセスする権限がありません。」', suspect: '権限不足（どの権限かは画面に出ない）', slug: 'wp-admin-403-capability' },
      { see: 'FTP と phpMyAdmin しか使えない', suspect: 'プラグイン停止・テーマ切替を手作業で', slug: 'recovery-without-wp-cli' },
    ],
  },
  {
    id: 'display-broken',
    label: '表示が崩れる・読み込めない',
    title: 'WordPress の表示が崩れる・画像や CSS が読み込めないとき',
    seoTitle: 'WordPress 表示が崩れる｜症状から探す',
    description:
      'CSSが効かない、スマホだけ崩れる、画像が表示されない、SSL化したら崩れた、ブロックエディターが真っ白、記事だけ404。ページ自体は表示される不具合の原因を切り分けます。',
    lead: 'このグループの不具合は、ページ本体が正常（HTTP 200）で返っています。壊れているのはページの中で読み込む CSS・JS・画像のほうです。',
    articles: [
      'css-js-not-loading',
      'images-not-displaying',
      'mobile-layout-broken',
      'ssl-mixed-content',
      'posts-404-permalink',
      'block-editor-blank',
      'admin-styles-broken',
    ],
    rows: [
      { see: 'CSS が効かない / JS が動かない', suspect: 'アセットが 404 か 403', slug: 'css-js-not-loading' },
      { see: '画像が表示されない（アップロードは成功）', suspect: '404 か 403 か、URL が違うか', slug: 'images-not-displaying' },
      { see: 'スマホだけレイアウトが崩れる', suspect: 'キャッシュ。サーバーは同じ HTML を返している', slug: 'mobile-layout-broken' },
      { see: 'SSL 化したら画像・CSS が読み込めない', suspect: '混在コンテンツ', slug: 'ssl-mixed-content' },
      { see: '投稿だけ 404（トップは出る）', suspect: '.htaccess が無い・効いていない', slug: 'posts-404-permalink' },
      { see: 'ブロックエディターが真っ白', suspect: 'エディタの JS が読めていないか REST が止まっている', slug: 'block-editor-blank' },
      { see: '管理画面だけ表示が崩れる', suspect: 'load-styles.php / load-scripts.php', slug: 'admin-styles-broken' },
    ],
  },
  {
    id: 'cannot-save',
    label: '保存・投稿・送信ができない',
    title: 'WordPress で保存・投稿・送信ができないとき',
    seoTitle: 'WordPress 保存・送信ができない｜症状から探す',
    description:
      '「更新に失敗しました」、メニューが一部消える、画像をアップロードできない、予約投稿されない、メールが届かない、Contact Form 7が送信できない。操作が完了しない不具合の原因を切り分けます。',
    lead: '保存や送信の失敗は、画面にエラーが出ないまま一部だけ捨てられていることがあります。「失敗した」のか「黙って欠けた」のかを先に分けてください。',
    articles: [
      'rest-json-update-failed',
      'max-input-vars-silent-loss',
      'media-upload-failure',
      'scheduled-post-missed',
      'wp-mail-not-delivered',
      'contact-form-7-not-sending',
      'emoji-and-timezone',
    ],
    rows: [
      { see: '「更新に失敗しました。返答が正しい JSON レスポンスではありません」', suspect: 'REST API が JSON を返していない', slug: 'rest-json-update-failed' },
      { see: '保存したのに一部だけ消えた', suspect: 'max_input_vars 超過', slug: 'max-input-vars-silent-loss' },
      { see: '画像をアップロードできない', suspect: 'サイズ上限 2 種類か、年月ディレクトリの権限', slug: 'media-upload-failure' },
      { see: '予約投稿されない', suspect: 'WP-Cron のループバック失敗', slug: 'scheduled-post-missed' },
      { see: 'メールが届かない', suspect: 'wp_mail() が false か、届かないだけか', slug: 'wp-mail-not-delivered' },
      { see: 'フォームの送信ボタンがくるくる止まらない', suspect: 'REST の到達性（nonce ではない）', slug: 'contact-form-7-not-sending' },
      { see: '絵文字が消える / 時刻が 9 時間ずれる', suspect: 'utf8 と utf8mb4、タイムゾーン', slug: 'emoji-and-timezone' },
    ],
  },
  {
    id: 'slow-seo',
    label: '遅い・検索に出ない',
    title: 'WordPress が重い・検索結果に出てこないとき',
    seoTitle: 'WordPress が重い・検索に出ない｜症状から探す',
    description:
      'WordPressが重い、管理画面だけ遅い、Googleの検索結果に出てこない、RSSやサイトマップだけ壊れる。数値で原因を確かめる方法を実測で解説します。',
    lead: '「重い」も「検索に出ない」も、推測で設定を変える前に数値で確かめられます。',
    articles: ['site-is-slow', 'not-indexed-by-google', 'feed-sitemap-broken'],
    rows: [
      { see: '全ページが一律に遅い', suspect: 'wp_options の autoload 肥大', slug: 'site-is-slow' },
      { see: '管理画面だけ遅い', suspect: '外部通信の待ち', slug: 'site-is-slow' },
      { see: '検索結果に出てこない', suspect: 'noindex・サイトマップ 404', slug: 'not-indexed-by-google' },
      { see: 'RSS / サイトマップだけ壊れる', suspect: 'XML の前に余計な出力がある', slug: 'feed-sitemap-broken' },
    ],
  },
  {
    id: 'security',
    label: '乗っ取り・改ざん・セキュリティ',
    title: 'WordPress の乗っ取り・改ざん・セキュリティ確認',
    seoTitle: 'WordPress 乗っ取り・改ざん｜確認と対策',
    description:
      '知らない管理者がいる、スパムリンクが埋め込まれた、改ざんチェックの方法、wp-config.phpの漏洩、攻撃者から見えている情報。既定のWordPressを実測して確認方法と対策をまとめます。',
    lead: '改ざんの多くは wp-content とデータベースに残ります。本体のファイル検査だけでは見つかりません。',
    articles: [
      'compromised-db-side',
      'verify-checksums-blind-spots',
      'attack-surface-audit',
      'config-file-exposure',
      'ai1wm-backup-exposure',
      'broken-access-control',
      'auto-update-not-working',
      'role-design',
      'backup-and-restore',
    ],
    rows: [
      { see: '知らない管理者がいる / スパムリンクが埋まっている', suspect: 'データベース側の痕跡', slug: 'compromised-db-side' },
      { see: '改ざんを検査したい', suspect: 'verify-checksums は wp-content を見ていない', slug: 'verify-checksums-blind-spots' },
      { see: '不審なログイン試行が大量に来る', suspect: 'ユーザー名の漏洩・試行制限なし', slug: 'attack-surface-audit' },
      { see: '設定ファイルが漏れていないか心配', suspect: '本体ではなくバックアップファイル', slug: 'config-file-exposure' },
      { see: '移行に使ったバックアップが残っていないか心配', suspect: '.wpress が未ログインで取得できる。自動では消えない', slug: 'ai1wm-backup-exposure' },
      { see: 'プラグイン開発で権限チェックが不安', suspect: 'permission_callback・is_admin()', slug: 'broken-access-control' },
      { see: '自動更新にしているのに更新されていない', suspect: 'プラグインは 1 つずつ有効にしないと対象にならない', slug: 'auto-update-not-working' },
      { see: '誰にどの権限を割り当てるか決めたい', suspect: '管理者だけが持つ権限は 27 個', slug: 'role-design' },
      { see: 'バックアップが本当に戻せるか不安', suspect: '標準のエクスポートには設定もプラグインも含まれない', slug: 'backup-and-restore' },
    ],
  },
  {
    id: 'diagnosis',
    label: '原因の調べ方',
    title: 'WordPress の不具合の原因を調べる方法',
    seoTitle: 'WordPress エラーの調べ方｜ログと監視',
    description:
      'WordPressのエラーログの場所、サイトヘルスの「重大な問題」の読み方、サイトが壊れているのに監視がHTTP 200を返す理由。原因を推測する前に取る値をまとめます。',
    lead: 'ステータスコードだけでは判断できません。サイトが死んでいても 200 が返るケースがあります。',
    articles: [
      'where-are-the-logs',
      'no-audit-log',
      'site-health-reading',
      'http-200-when-site-is-down',
    ],
    rows: [
      { see: 'ログを見ても何も出ていない', suspect: '起動前のエラーは debug.log に入らない', slug: 'where-are-the-logs' },
      { see: '誰がいつ設定やプラグインを変えたか分からない', suspect: 'WordPress は操作の記録を残さない', slug: 'no-audit-log' },
      { see: 'サイトヘルスに「重大な問題」が出ている', suspect: 'ループバック不通による偽陽性', slug: 'site-health-reading' },
      { see: '監視は正常なのに壊れている', suspect: 'HTTP 200 で返る障害', slug: 'http-200-when-site-is-down' },
      { see: 'REST API のエラーが監視に出ない', suspect: 'REST の Fatal は 200 で返る', slug: 'http-200-when-site-is-down' },
    ],
  },
];

export const hubOf = (slug: string) => HUBS.find((h) => h.articles.includes(slug));
