---
title: "PHP8にしたらサイトが動かない・エラーが出る時の対処法（PHP7から移行）"
slug: php7-to-php8-breaking-changes
seo_title: "PHP8 でサイトが動かない｜PHP7 からの移行"
description: "PHPを7から8に上げたらサイトが動かない・エラーが出る時の対処法。create_function・is_admin・波括弧などが8でFatalになる6パターンを7.4と8.2で実測。0=='文字列'が警告なしで反転する落とし穴も。"
keywords: "PHP8 エラー, PHP8 動かない, PHP アップデート 白い, PHP7 PHP8 移行, create_function 削除, PHP8 Fatal error, PHP バージョン 上げたら"
category: 技術メモ
tags: [wordpress, php, php8, 移行, 非推奨, デバッグ]
summary: |
  PHP 7.4 と 8.2 で同じコードを動かすと、壊れ方は 2 種類でした。
  ・Fatal になる → create_function、非静的メソッドの静的呼び出し、波括弧の文字列オフセット。3 つとも 7.4 の debug.log に Deprecated として出ていた
  ・エラーなしで結果が変わる → 0 == 'wp' が true から false に反転する。debug.log には出ない
  ・上げる前に、7.4 のまま debug.log の Deprecated を読んで直す
  ・決済・在庫・権限に関わる == は === に直し、上げた直後は数字が出る画面を人が確認する
status: published
published: 2026-09-16
verified: 2026-09-12
---

PHP を 7 系から 8 系に上げたらサイトが落ちた。あるいは、
**落ちていないのに数字や分岐がおかしい。**

同じコードを **PHP 7.4.33 と 8.2.33** の両方で動かして、
何がどう変わるかを 1 つずつ計測しました。
拡張モジュールの構成は両方で同一にしてあるので、
**差はバージョン差だけ**です。

## 結論の一覧

| 書き方 | PHP 7.4 | PHP 8.2 |
|---|---|---|
| `create_function()` | **Deprecated + 動作**（結果 42） | **Fatal**（関数が存在しない） |
| 非静的メソッドの静的呼び出し | **Deprecated + 動作**（`[x]`） | **Fatal** |
| 波括弧の文字列オフセット `$s{0}` | **Deprecated + 動作**（`w`） | **Fatal**（構文として無効） |
| 未定義のキー・変数を読む | **Notice** | **Warning** |
| 内部関数に `null` を渡す | **警告なし** | **Deprecated** |
| **`0 == '文字列'` の比較** | **`true`** | **`false`** |
| 引数不足の関数呼び出し | **Fatal** | **Fatal**（7.4 でも既に Fatal） |

**上の 3 つは落ちるので気づきます。下の 3 つが本当の問題です。**

## 落ちるもの（気づける）

### 1. `create_function()`

PHP 7.2 で非推奨、**8.0 で削除**されました。
2010 年代のプラグインに広く使われていた書き方です。

```php
$double = create_function( '$n', 'return $n * 2;' );
echo $double( 21 );
```

| | 結果 |
|---|---|
| 7.4 | `Deprecated: Function create_function() is deprecated` が出るが、**42 が返る** |
| 8.2 | `Fatal error: Uncaught Error: Call to undefined function create_function()` |

**直し方** — 無名関数に置き換えます。

```php
$double = static function ( $n ) {
	return $n * 2;
};
```

### 2. 非静的メソッドの静的呼び出し

インスタンスを作らずに `Class::method()` と書いているコードです。

```php
class Helper {
	public function format( $v ) { return '[' . $v . ']'; }
}
echo Helper::format( 'x' );
```

| | 結果 |
|---|---|
| 7.4 | `Deprecated: Non-static method Helper::format() should not be called statically` が出るが、**`[x]` が返る** |
| 8.2 | `Fatal error: Uncaught Error: Non-static method Helper::format() cannot be called statically` |

**直し方** — メソッドを `static` にするか、インスタンス経由で呼びます。

```php
class Helper {
	public static function format( $v ) { return '[' . $v . ']'; }
}
// または
$h = new Helper();
echo $h->format( 'x' );
```

### 3. 波括弧の文字列オフセット

`$str{0}` のように波括弧で文字を取り出す書き方です。

```php
function first_char( $str ) {
	return $str{0};
}
```

| | 結果 |
|---|---|
| 7.4 | `Deprecated: Array and string offset access syntax with curly braces is deprecated`。**`w` が返る** |
| 8.2 | `Fatal error: Array and string offset access syntax with curly braces is no longer supported` |

**これは他の 2 つより厄介です。**構文として無効になったため、
**そのファイルを読み込んだ時点で落ちます。**実行されなくても関係ありません。

つまり「使われていない古い関数の中に 1 行残っている」だけで、
ファイル全体が読めなくなります。**WordPress のエラーハンドラも介入できません**
（コンパイル時に落ちるため）。

**直し方** — 角括弧にします。

```php
return $str[0];
```

## 落ちないもの（ここが本当の問題）

### 4. `0 == '文字列'` の比較が反転する

**PHP 8 でいちばん事故が起きるのはこれです。**
エラーも警告も一切出ません。**結果だけが変わります。**

実測値です。

| 式 | 7.4 | 8.2 |
|---|---|---|
| `0 == 'wp'` | **true** | **false** |
| `'abc' == 0` | **true** | **false** |
| `in_array( 0, ['a'] )` | **true** | **false** |
| `'1' == '01'` | true | true（変化なし） |
| `'10' == '1e1'` | true | true（変化なし） |

PHP 7 までは、数値と文字列を比較すると**文字列を数値に変換**していました。
`'wp'` は数値にすると `0` なので `0 == 'wp'` が成立していたのです。

PHP 8 では、**相手が数値でない文字列なら、数値を文字列に変換して比較**します。
`'0' == 'wp'` の比較になるので `false` です。

**数値文字列同士（`'1'` と `'01'`）は両方で `true`** です。
変わるのは「数値」対「数値でない文字列」の組み合わせだけ、という点が重要です。

#### 何が起きるか

```php
// 意図: 種別が指定されていないときの分岐
if ( $type == 0 ) {
	// 既定の処理
}
```

`$type` に `'post'` のような文字列が入ってきた場合:

- **7.4 では `true`** → 既定の処理に入っていた
- **8.2 では `false`** → 入らなくなる

**エラーは出ません。**ただ、今まで通っていた分岐を通らなくなります。
「金額が 0 円で計算される」「条件に合う投稿が出てこない」
「権限チェックが通らない（あるいは通ってしまう）」といった形で現れます。

`in_array()` も既定では緩い比較なので、同じ影響を受けます。

**直し方** — 厳密比較（`===`）を使います。

```php
if ( 0 === $type ) { ... }
in_array( 0, $arr, true );   // 第 3 引数 true で厳密比較
```

意図的に文字列も受けたい場合は、先に型を揃えます。

```php
if ( 0 === (int) $type ) { ... }
```

**この変更は grep では見つけられません。**`==` を使っている箇所すべてが
候補になるためです。テストが無いコードでは、実際に動かして確認するしかありません。

### 5. 未定義のキー・変数が Notice から Warning へ

```php
$a = array( 'x' => 1 );
echo $a['missing'];   // 存在しないキー
echo $undefined_var;  // 未定義変数
```

| | 7.4 | 8.2 |
|---|---|---|
| 存在しないキー | `Notice: Undefined index: missing` | **`Warning: Undefined array key "missing"`** |
| 未定義変数 | `Notice: Undefined variable: undefined_var` | **`Warning: Undefined variable $undefined_var`** |

**動作は変わりません**（どちらも `NULL` が返る）。変わるのは深刻度と文言です。

問題は 2 つあります。

- **ログの量が増える。**`error_reporting` の設定によっては、
  Notice は記録していなかったが Warning は記録する、という環境があります。
  「PHP を上げたら `debug.log` が急に膨らんだ」の原因がこれです
- **`display_errors` が有効だと画面に出る。**Notice では出ていなかったものが
  Warning になって表示され、**ヘッダより先に出力されるため
  リダイレクトや Cookie が壊れます**

後者は別記事で実測しています。
→ [functions.php を壊したときの復旧](functions-php-broken-recovery.md)

**直し方** — 存在確認を入れます。

```php
echo $a['missing'] ?? '';
echo isset( $undefined_var ) ? $undefined_var : '';
```

### 6. 内部関数に `null` を渡すと非推奨

```php
echo strlen( null );
```

| | 7.4 | 8.2 |
|---|---|---|
| 出力 | `0`（**警告なし**） | `0` + **`Deprecated: strlen(): Passing null to parameter #1 ($string) of type string is deprecated`** |

動作は同じですが、**警告の量が一気に増えます。**
`$_GET` や DB の値をそのまま関数に渡しているコードは、
値が無いときに `null` が流れるため、該当箇所が大量に出ます。

これは PHP 9 で **TypeError（Fatal）になる予定**の項目です。
つまり**今のうちに直しておくべきもの**です。

**直し方** — 呼ぶ前に型を揃えます。

```php
echo strlen( (string) $value );
echo strlen( $value ?? '' );
```

## 通説の訂正: 引数不足は 7 系でも Fatal

「PHP 8 から引数不足が Fatal になった」と書かれていることがありますが、
**7.4 でも既に Fatal でした。**実測値です。

```php
function needs_arg( $label ) { return 'label=' . $label; }
needs_arg();   // 引数を渡さない
```

| | 結果 |
|---|---|
| 7.4 | `Fatal error: Uncaught ArgumentCountError: Too few arguments` |
| 8.2 | **同じ** |

`ArgumentCountError` は **PHP 7.1 で導入**されています。
これは 7 → 8 の変更点ではありません。

## 上げる前にやること

**`debug.log` を読むだけで、落ちる箇所のほとんどが事前に分かります。**

今回の 6 パターンのうち、**8 系で Fatal になる 3 つはすべて、
7.4 の時点で `Deprecated` として記録されていました。**

```
Deprecated: Function create_function() is deprecated
Deprecated: Non-static method Helper::format() should not be called statically
Deprecated: Array and string offset access syntax with curly braces is deprecated
```

**非推奨警告は「いつか壊れる」の予告です。**
上げてから調べるのではなく、上げる前に読みます。

### 手順

```php
// wp-config.php
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );   // 訪問者には見せない
```

```sh
# opcache をリセットしてから 1 回アクセスする
# (コンパイル時の警告は 1 回しか出ないため)
: > wp-content/debug.log
curl -s -o /dev/null https://example.com/
grep -c Deprecated wp-content/debug.log
grep Deprecated wp-content/debug.log | sed 's|.*/wp-content/|wp-content/|' | sort -u
```

**opcache のリセットを忘れると、コンパイル時の警告が出ません。**
`Array and string offset access syntax` のような構文レベルの警告は
ファイルをコンパイルしたときにだけ出るため、キャッシュが残っていると
二度と現れません（別記事で実測しています）。
→ [PHP を上げたらサイトが白画面になった](php-upgrade-white-screen.md)

### 比較の変更は警告に出ない

**4 番（`==` の比較）だけは、どれだけ `debug.log` を読んでも出てきません。**
非推奨でも何でもなく、単に言語の仕様が変わったためです。

対策は 3 つです。

1. **決済・在庫・権限に関わる `==` を探して `===` にする**
   （全部は無理でも、間違うと損害が出る箇所から）
2. **`in_array()` に第 3 引数 `true` を足す**
3. **上げた直後は、数字が出る画面を人が見て確認する**
   （合計金額、件数、在庫数、ポイント）

## 環境を両方用意する

本番と同じコードを、**いまの PHP と上げる先の PHP の両方で**動かして比べるのが確実です。
この記事の検証では Docker で 7.4 と 8.2 を切り替えました（手順は再現手順に載せています）。

**EOL を過ぎたバージョンは apt が失敗します**が、
公式イメージに同梱されている `snapshot.debian.org` の行を有効化すれば建てられます。
手順は [PHP を上げたらサイトが白画面になった](php-upgrade-white-screen.md) に
書きました。

**拡張モジュールの構成を両方で同一にしておくこと**が重要です。
違っていると、バージョン差ではなくビルド差で挙動が変わり、
比較結果が信用できなくなります。

## 再現手順

```sh
# .env の PHP_VERSION を 7.4 / 8.2 / 8.4 に変えて作り直す
docker compose build php apache
docker compose up -d --no-deps --force-recreate php apache
docker compose restart nginx      # php の IP が変わるので nginx も再起動する
```

```sh
wp plugin activate lab-legacy-php

# ケースごとに踏む
for c in create_function static_call curly compare undefined_key null_to_internal; do
  echo "--- $c"
  curl -s "http://localhost:8080/?php8=$c&key=lab" | sed 's/<[^>]*>//g' | head -5
done

# .env の PHP_VERSION を変えて、同じことをもう一度
```
