export const SITE_NAME = 'WP復旧ラボ';
export const SITE_DESCRIPTION =
  'WordPress の「真っ白」「ログインできない」「500 エラー」を、実際に壊して測った値で切り分けるトラブル対処集。';

// front matter の日付は UTC 0 時で読まれるので UTC で表示する
export const OPERATOR_NAME = 'NOANAVI運営者';
export const OPERATOR_PROFILE = 'WordPress サイトの保守を 7 年担当';

// front matter の日付は UTC 0 時で読まれるので UTC で表示する
export const formatDate = (d: Date) =>
  `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
