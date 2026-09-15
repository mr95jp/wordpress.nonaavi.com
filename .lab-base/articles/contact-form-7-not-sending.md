---
title: "Contact Form 7で送信できない・くるくる止まらない時の対処法"
slug: contact-form-7-not-sending
seo_title: "Contact Form 7 送信できない・くるくる｜原因と対処法"
description: "Contact Form 7で送信ボタンがくるくる回ったまま止まらない・送信できない時の対処法。原因はREST APIの到達性で、「キャッシュでnonceが切れる」は現行版では起きないことを実測。症状で3つに切り分ける。"
keywords: "Contact Form 7 送信できない, Contact Form 7 くるくる, フォーム 送信できない, CF7 くるくる 止まらない, 問い合わせフォーム 送信できない"
category: 障害報告
tags: [wordpress, contact-form-7, フォーム, キャッシュ, rest-api, nonce]
status: draft
verified: 2026-09-12
---

送信ボタンを押すとぐるぐる回ったまま止まらない。あるいは何も起きない。

対策として「キャッシュを除外する（nonce が期限切れになるから）」という説明が
広く出回っています。**現行の Contact Form 7 では、この説明は当てはまりません。**
実際にインストールして計測しました（バージョン 6.1.7）。

## 実測: 匿名の訪問者向けには nonce が出ていない

フォームを設置したページの HTML から、hidden フィールドを全部取り出しました。

```
_wpcf7                   = 50
_wpcf7_version           = 6.1.7
_wpcf7_locale            = ja
_wpcf7_unit_tag          = wpcf7-f50-p51-o1
_wpcf7_container_post    = 51
_wpcf7_posted_data_hash  = （空）
```

**nonce に相当するフィールドは 1 つもありません。**
HTML 全体を `nonce` で検索しても出現回数は **0** でした。

念のため、**nonce を一切付けずに**送信エンドポイントへ POST しました。

```
$ curl -X POST ".../wp-json/contact-form-7/v1/contact-forms/50/feedback" \
    -F "_wpcf7=50" -F "your-name=テスト太郎" -F "your-email=test@lab.local" \
    -F "your-subject=件名テスト" -F "your-message=本文テスト"

HTTP 200
status : mail_sent
message: Thank you for your message. It has been sent.
```

**送信は成功し、メールも届きました。**

### 実装でも確認した

プラグインのコードを見ると、nonce は**ログイン中のユーザーにだけ**付きます。

```php
// contact-form.php
if ( $this->nonce_is_active() and is_user_logged_in() ) { ... }

// submission.php
if ( ! $this->contact_form->nonce_is_active() or ! is_user_logged_in() ) {
    // 検証をスキップする
}
```

**匿名の訪問者には nonce を付けず、検証もしません。**
キャッシュされた HTML を使っても、そこに期限切れになるものが無いので壊れません。

これは Contact Form 7 側が**キャッシュと共存するために意図的にそうしている**
設計です。「キャッシュから除外しないと nonce が切れる」という対策は、
古いバージョンの情報がそのまま残っているものです。

**ログイン中のユーザーには nonce が付きます。**ただしログインユーザーの
ページは通常キャッシュされないため、こちらも実務では問題になりません。

## では現行版で何が原因なのか

計測して分かった、実際に壊れる経路は 3 つです。

### 原因 1: REST API に到達できない（これが「くるくる」の正体）

Contact Form 7 は REST API のエンドポイントに送信します。

```
/wp-json/contact-form-7/v1/contact-forms/<フォームID>/feedback
```

セキュリティプラグインや `.htaccess` で `/wp-json` を塞いでいると、
ここに到達できません。実測です。

| | ステータス | Content-Type |
|---|---|---|
| Apache（`.htaccess` で `/wp-json` を拒否） | **403** | **text/html** |
| nginx（`.htaccess` を読まない） | 400 | application/json |

**JavaScript は JSON を期待しているのに HTML を受け取ります。**
パースに失敗し、成功も失敗も表示できないため、
**送信中の表示（ぐるぐる）が消えません。**

![送信ボタンの横で回転表示が止まらない](../screenshots/s/cf7-submit-spinner.jpg)

*.htaccess で wp-json を塞いだ状態で送信した画面。4 秒待っても送信中の表示のまま、結果のメッセージは出ない*

これが「くるくる止まらない」のいちばん多い原因です。
`.htaccess` を読まない nginx 側では起きないため、
**2 台構成で片方だけ送信できない**ということも起こります。

確認方法は 1 行です。

```sh
curl -s -o /dev/null -D - https://example.com/wp-json/ | grep -i content-type
```

`application/json` 以外が返っていたら、これが原因です。
→ [「返答が正しい JSON レスポンスではありません」](rest-json-update-failed.md)

### 原因 2: JavaScript が読み込まれていない

こちらは**逆に、送信自体は成功します。**実測しました。

JavaScript を使わず、ブラウザの通常の POST と同じ形でページに送信した結果です。

```
HTTP 200
「Thank you for your message. It has been sent.」
```

**JS が無くても動きます。**Contact Form 7 はサーバー側でも処理できるよう
作られているため、JS が読み込まれていない場合は
**ページが再読み込みされて結果が表示される**という挙動になります。

つまり症状で区別できます。

| 症状 | 意味 |
|---|---|
| **ぐるぐる回ったまま止まらない** | JS は動いている。応答を受け取れていない（原因 1） |
| **ページが再読み込みされて結果が出る** | JS が読み込まれていない（見た目は悪いが動いている） |
| **ボタンを押しても何も起きない** | JS がエラーで止まっている（原因 3） |

「キャッシュプラグインの JS 結合を切ったら直った」という報告は、
多くが原因 3（JS エラー）です。
→ [CSS が効かない・JS が動かない](css-js-not-loading.md)

### 原因 3: JavaScript のエラー

他のプラグインが出した JS エラーで、フォームの初期化が止まっている場合です。
**ボタンを押しても何も起きません。**

ブラウザのコンソールの**一番上のエラー**を見ます。
jQuery の二重読み込みが典型です。
→ [プラグインの競合](plugin-conflict-diagnosis.md)

## 送信はできているがメールが届かない場合

ここから先はフォームの問題ではありません。**画面に「送信しました」と
出ているなら、Contact Form 7 は仕事を終えています。**

| 画面の表示 | 意味 |
|---|---|
| 「ありがとうございます。メッセージは送信されました。」 | `wp_mail()` は成功した。**届かないのは別の層** |
| 「メッセージの送信に失敗しました。」 | `wp_mail()` が false を返した。**WordPress 側の設定** |

後者でよくある原因は、送信元アドレスが不正な場合です。
WordPress の既定は `wordpress@<サーバー名>` で、**サーバー名にドットが
含まれていないと PHPMailer が送信を中止します**（実測済み）。

→ [WordPress からメールが届かない](wp-mail-not-delivered.md)

**Flamingo（Contact Form 7 と同じ作者の保存プラグイン）を入れておくと、
送信内容がデータベースに残ります。**メールが届かなくても内容を失わずに済み、
「送信自体はできているのか」の切り分けも一目で終わります。

## 切り分けの順番

```sh
# 1. REST が JSON を返すか(「くるくる」の判定)
curl -s -o /dev/null -D - https://example.com/wp-json/ | grep -i content-type

# 2. フォームのあるページに nonce が出ているか(現行版なら 0 件が正常)
curl -s https://example.com/contact/ | grep -c nonce

# 3. 送信エンドポイントに直接 POST してみる
curl -s -X POST "https://example.com/wp-json/contact-form-7/v1/contact-forms/<ID>/feedback" \
  -F "_wpcf7=<ID>" -F "your-name=test" -F "your-email=test@example.com" \
  -F "your-subject=test" -F "your-message=test"
```

| 結果 | 原因 |
|---|---|
| 1 が `text/html` | REST が塞がれている。**これが「くるくる」** |
| 3 が `mail_sent` を返す | **サーバー側は正常。**ブラウザ側（JS・キャッシュ）の問題 |
| 3 が `mail_failed` を返す | `wp_mail()` の失敗。メール設定を見る |
| 3 が `validation_failed` を返す | 必須項目の指定漏れ。フォーム設定を見る |

**3 が `mail_sent` を返すなら、フォームもメールも動いています。**
その場合に調べるのはブラウザ側だけです。

## キャッシュ対策は不要になったのか

nonce のための除外は不要になりました。ただし
**キャッシュ関連で別の問題は残ります。**

| 残っている問題 | 対処 |
|---|---|
| JS の結合・最小化でフォームの JS が壊れる | その機能だけをオフにする、または対象外に指定する |
| 送信完了ページをキャッシュしてしまう | 完了ページをキャッシュ対象外にする |
| 古い HTML が残ってフォーム項目が実際と違う | フォームを編集したらキャッシュを消す |

**「とりあえずフォームのページをキャッシュから除外する」は、
今でも副作用の少ない安全策**です。ただし理由は nonce ではありません。

## 計測しなかったこと

キャッシュプラグインを入れての再現はしていません。
**nonce が存在しないことがプラグインの出力とソースの両方で確認できたため、
「キャッシュが nonce を古くする」経路は成立しない**と判断しました。

JS の結合で壊れる側は、キャッシュプラグインの実装ごとに違うため、
一般化して書けません。そちらは
[CSS が効かない・JS が動かない](css-js-not-loading.md) の観点で確認してください。

## 再現手順

```sh
wp plugin install contact-form-7 --activate
# 有効化時に「Contact form 1」が自動で作られる
wp post list --post_type=wpcf7_contact_form --fields=ID,post_title

wp post create --post_type=page --post_status=publish \
  --post_title="お問い合わせ" --post_content='[contact-form-7 id="50"]'

# nonce が出ているか(0 件が現行版の正常)
curl -s "<ページURL>" | grep -c nonce

# nonce なしで送信できるか
curl -s -X POST "http://localhost:8080/wp-json/contact-form-7/v1/contact-forms/50/feedback" \
  -F "_wpcf7=50" -F "your-name=t" -F "your-email=t@lab.local" \
  -F "your-subject=s" -F "your-message=m"
# → status: mail_sent

# REST を塞ぐと Apache だけ 403 text/html になる
# .htaccess に RewriteRule ^wp-json/ - [F,L] を(WordPress ブロックより前に)入れる
```
