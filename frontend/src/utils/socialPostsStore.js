/**
 * socialPostsStore.js
 * ──────────────────────────────────────────────────────────────────
 * 統一管理所有 socialPosts 的 localStorage 存取。
 * 每筆貼文資料都以 userId 做命名空間，確保多使用者資料完全隔離。
 *
 * 使用方式：
 *   import { getSocialPosts, addSocialPost, deleteSocialPost, updateSocialPost } from './socialPostsStore';
 *
 *   const posts = getSocialPosts(userId);
 *   addSocialPost(post, userId);
 *   deleteSocialPost(activityId, userId);
 *   updateSocialPost(activityId, { caption: '...' }, userId);
 *
 * 注意：userId 若未傳入，自動從 auth 工具取得當前登入使用者。
 * ──────────────────────────────────────────────────────────────────
 */

import { uStorage } from './userStorage';
import { getUserId } from './auth';

const _uid = (userId) => userId || getUserId() || 'local';

/**
 * 讀取指定使用者的所有貼文（新→舊排列）
 */
export const getSocialPosts = (userId) =>
  uStorage(_uid(userId)).get('socialPosts', []);

/**
 * 新增一筆貼文到最前面
 */
export const addSocialPost = (post, userId) => {
  const uid = _uid(userId);
  return uStorage(uid).getAndUpdate('socialPosts', (posts) => [post, ...posts], []);
};

/**
 * 刪除指定 activity_id 的貼文
 */
export const deleteSocialPost = (activityId, userId) => {
  const uid = _uid(userId);
  return uStorage(uid).getAndUpdate(
    'socialPosts',
    (posts) => posts.filter((p) => p.activity_id !== activityId),
    []
  );
};

/**
 * 清空目前使用者的所有社群貼文（本地）+ 留言快取
 */
export const clearAllSocialPosts = (userId) => {
  const uid = _uid(userId);
  uStorage(uid).set('socialPosts', []);
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('drvn_comments_')) localStorage.removeItem(k);
    });
  } catch (e) { /* ignore */ }
};

/**
 * 更新指定 activity_id 的貼文欄位（部分更新，merge）
 */
export const updateSocialPost = (activityId, updates, userId) => {
  const uid = _uid(userId);
  return uStorage(uid).getAndUpdate(
    'socialPosts',
    (posts) =>
      posts.map((p) =>
        p.activity_id === activityId ? { ...p, ...updates } : p
      ),
    []
  );
};
