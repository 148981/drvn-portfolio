import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../../api/client';
import { getUserId } from '../../utils/auth';
import { getSocialPosts, addSocialPost, deleteSocialPost, updateSocialPost } from '../../utils/socialPostsStore';
import { buildFeed } from '../../utils/socialFeed';
import { appendIdentity, getDisplayName, identityFields } from '../../utils/socialIdentity';
import { confirmDialog, toast } from '../../utils/toast';
import { useFollowing } from './useFollowing';
import { failureLine } from '../../utils/apiFailure';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * useCommunityFeed — 社群動態牆的行為，一份實作
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-09 社群稽核的第二階段。
 *
 * 背景：SocialHubMobile（跑步）與 FitnessCommunityPage（健身）是同一個畫面 ——
 * 一樣的四個分頁（動態／排行／社團／我的）、共用 14 個子元件，
 * 只差在排行榜元件、字標，以及 feed 的 community 參數。
 * 但兩頁各自寫了一份「抓資料 / 發文 / 按讚 / 刪除 / 編輯 / 過濾」，
 * 於是同一個 bug 修一邊忘一邊 —— 上一輪稽核抓到的
 * 「照片貼文變 0 公里跑步卡」「發文欄位丟失」就是這樣只修好一半的。
 *
 * 這支 hook 把那些行為收成一份。兩頁剩下的差異只有「長什麼樣」：
 * 貼文卡怎麼畫、排行榜用哪個元件 —— 那才是真正該不一樣的地方。
 *
 * @param {object}  o
 * @param {string}  o.userId
 * @param {'run'|'fitness'} o.community      這一頁屬於哪個社群
 * @param {function} o.buildDraft            (data, ctx) => 本機貼文物件（各頁的欄位形狀不同）
 * @param {function} [o.localFilter]         從 localStorage 撈出來後要留哪些
 * @param {function} [o.extraVisibleFilter]  額外的顯示過濾（跑步頁用來擋空白跑步卡）
 * @param {object}  [o.createFields]         發文時要多帶給後端的欄位
 */
export function useCommunityFeed({
    userId,
    community = 'run',
    buildDraft,
    localFilter,
    extraVisibleFilter,
    createFields,
}) {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    /* 後端動態取不到時為「那句要給使用者看的話」，取得到時為 null。
       稽核前這裡是 boolean，畫面一律說「連不到伺服器」——
       但正式站其實是後端 500，使用者換了三次網路都沒用。
       現在講的是實際發生的事。 */
    const [feedError, setFeedError] = useState(null);
    const [feedFilter, setFeedFilter] = useState('following');
    const [commentPostId, setCommentPostId] = useState(null);
    const [kudoersPostId, setKudoersPostId] = useState(null);
    const [editingPost, setEditingPost] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    // 追蹤 / 粉絲 / 好友：兩個社群共用同一張 followGraph
    const { following, setFollowing, graph, counts } = useFollowing(userId);

    // 新使用者（還沒追蹤任何人）首次進來自動切到「探索」，只切一次，不覆蓋手動切換
    const didAutoSwitchFilter = useRef(false);
    useEffect(() => {
        if (loading || didAutoSwitchFilter.current) return;
        didAutoSwitchFilter.current = true;
        if ((following?.length || 0) === 0) setFeedFilter('discover');
    }, [loading, following]);

    // ── 載入 ────────────────────────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        const run = async () => {
            setLoading(true);
            // 本機先拿：後端掛了也要看得到自己發過什麼
            const localRaw = getSocialPosts(userId);
            const localItems = localFilter ? localRaw.filter(localFilter) : localRaw;

            let serverItems = [];
            let failed = null;
            try {
                const r = await api.get('/api/feed/global', {
                    params: { user_id: userId, limit: 30, community: community === 'fitness' ? 'fitness' : 'cardio' },
                });
                serverItems = r.data?.items || [];
            } catch (err) {
                failed = failureLine(err, '動態');
                console.warn(`[${community}Feed] 後端動態取不到（${err?.response?.status || '無回應'}）：`, err?.message || err);
            }
            if (!alive) return;
            // 映射／去重／排序統一交給 utils/socialFeed
            setActivities(buildFeed({ local: localItems, server: serverItems, community }));
            setFeedError(failed);
            setLoading(false);
        };
        run();
        return () => { alive = false; };
    }, [userId, community]);   // eslint-disable-line react-hooks/exhaustive-deps

    // ── 發文 ────────────────────────────────────────────────────────────
    const handleNewPost = useCallback(async (data) => {
        const uName = getDisplayName(userId);
        const draft = buildDraft(data, { userId, uName, community });

        setActivities(prev => [draft, ...prev]);
        setShowCreate(false);
        setFeedFilter('following');   // 切回追蹤中，確保看得到自己剛發的

        // 先存本機 —— 後端失敗也不能讓剛打完的內容消失
        addSocialPost(draft, userId);

        let synced = false;
        try {
            const fd = new FormData();
            appendIdentity(fd, userId);
            fd.append('caption', data.caption || '');
            fd.append('privacy', draft.visibility || 'public');
            fd.append('activity_type', draft.activity_type);
            fd.append('communities', JSON.stringify(draft.targets || [community]));
            fd.append('session_data', JSON.stringify(draft.session_data || {}));
            if (draft.photo) fd.append('photo_url', draft.photo);
            if (draft.title) fd.append('title', draft.title);
            if (draft.location) fd.append('location', draft.location);
            if (Array.isArray(draft.tags) && draft.tags.length) fd.append('tags', JSON.stringify(draft.tags));
            if (draft.imgPos != null) fd.append('img_pos', String(draft.imgPos));
            Object.entries(createFields || {}).forEach(([k, v]) => fd.append(k, v));

            const res = await api.post('/api/activities/create', fd);

            /* 🔑 重複貼文的根因：後端會發一個自己的 uuid，
               但這個 id 從來沒被寫回本機那份 —— 於是本機是 'local_...'、
               後端是 uuid，下次載入兩份都進 feed，依 id 去重抓不到，
               使用者看到自己每篇都貼了兩遍。
               把伺服器 id 認回來，本機與後端從此是同一篇；
               按讚／留言／編輯／刪除也才打得到正確的 id。 */
            const serverId = res?.data?.activity_id;
            if (serverId) {
                updateSocialPost(draft.activity_id, { activity_id: serverId, synced: true }, userId);
                setActivities(prev => prev.map(x => (x.id === draft.id ? { ...x, id: serverId } : x)));
            }
            synced = true;
        } catch (e) {
            console.error('[Feed] 發文送出失敗：', e);
        }

        /* 誠實回饋：稽核前不論成敗都報「已發布」—— 後端失敗時等於騙人，
           使用者以為朋友看得到，其實只存在自己手機裡。 */
        try {
            const who = draft.visibility === 'friends' ? '僅好友可見'
                : draft.visibility === 'followers' ? '粉絲可見' : '公開';
            const where = (draft.targets || [community]).map(t => (t === 'fitness' ? '健身社群' : '跑步社群'));
            if (synced) toast.success(`已發布到${where.join('、')} · ${who}`);
            else toast.info('已存在這台裝置上，但還沒送到伺服器 —— 其他人目前看不到');
        } catch { /* toast 不可用不影響發文 */ }
    }, [userId, community, buildDraft, createFields]);

    // ── 按讚 ────────────────────────────────────────────────────────────
    /* 稽核前三個問題：只改 state 不寫回本機（重載歸零）、
       user_name 寫死「我」（後端每個人的按讚者都叫「我」）、
       對 'local_' 開頭的 id 打後端必定失敗又被 catch 吞掉。 */
    const handleKudo = useCallback(async (postId) => {
        let before = null;
        setActivities(prev => prev.map(p => {
            if (p.id !== postId) return p;
            before = p;
            const next = !p.myKudo;
            return { ...p, myKudo: next, kudos: next ? (p.kudos || 0) + 1 : Math.max(0, (p.kudos || 0) - 1) };
        }));
        if (!before) return;

        const next = !before.myKudo;
        const applied = { myKudo: next, kudos: next ? (before.kudos || 0) + 1 : Math.max(0, (before.kudos || 0) - 1) };
        // 立刻寫回本機，重載後愛心才不會消失
        try { updateSocialPost(postId, { myKudo: applied.myKudo, kudos_count: applied.kudos }, userId); } catch { /* 隱私模式 */ }

        // 本機貼文還沒同步，沒有伺服器 id 可打 —— 不用送、也不算失敗
        if (String(postId).startsWith('local_')) return;

        try {
            const fd = new FormData();
            appendIdentity(fd, userId);
            fd.append('action', next ? 'add' : 'remove');
            await api.post(`/api/activities/${postId}/kudos`, fd);
        } catch {
            setActivities(prev => prev.map(p => (p.id === postId ? { ...p, myKudo: before.myKudo, kudos: before.kudos } : p)));
            try { updateSocialPost(postId, { myKudo: before.myKudo, kudos_count: before.kudos }, userId); } catch { /* ok */ }
            toast.error('按讚沒有送出去，請稍後再試');
        }
    }, [userId]);

    // ── 刪除 ────────────────────────────────────────────────────────────
    const handleDelete = useCallback(async (postId) => {
        const ok = await confirmDialog('按讚和留言會一起刪除，而且沒辦法復原。', {
            title: '刪除這則貼文？', confirmText: '刪除', cancelText: '取消', danger: true,
        });
        if (!ok) return;

        let snapshot = [];
        setActivities(prev => { snapshot = prev; return prev.filter(p => p.id !== postId); });
        try { deleteSocialPost(postId, userId); } catch { /* 隱私模式 */ }

        if (String(postId).startsWith('local_')) return;   // 後端沒有這篇

        try {
            /* ⚠️ 後端的 user_id 是必填 query —— 以前沒帶，每次都 422：
               畫面上先消失、接著「刪除失敗，這則貼文還在」又跳回來。 */
            await api.delete(`/api/activities/${postId}`, { params: { user_id: identityFields(userId).user_id } });
            toast.success('已刪除');
        } catch {
            /* 刪除失敗卻已經從畫面消失，是最容易讓人誤會的一種：
               使用者以為刪掉了，別人其實還看得到。放回去並說清楚。 */
            setActivities(snapshot);
            toast.error('刪除失敗，這則貼文還在。請稍後再試');
        }
    }, [userId]);

    // ── 編輯 ────────────────────────────────────────────────────────────
    const handleEdit = useCallback((post) => setEditingPost(post), []);

    /* patch 形狀：{ caption, title, location, tags, visibility, communities, imgPos }，只放有改的欄位。
       舊呼叫端傳字串 → 當成只改內文。 */
    const EDITABLE = ['caption', 'title', 'location', 'tags', 'visibility', 'communities', 'imgPos'];
    const saveEdit = useCallback(async (postId, patchIn) => {
        const patch = typeof patchIn === 'string' ? { caption: patchIn } : { ...(patchIn || {}) };
        const keys = EDITABLE.filter((k) => k in patch);
        if (!keys.length) return true;

        let before = null;
        // 社群歸屬讀的是 targets || communities —— 兩個都要改，不然舊的 targets 會蓋掉新設定
        const statePatch = { ...patch, ...('communities' in patch ? { targets: patch.communities } : {}) };
        setActivities(prev => prev.map(p => {
            if (p.id !== postId) return p;
            before = p;
            return { ...p, ...statePatch };
        }));
        try { updateSocialPost(postId, statePatch, userId); } catch { /* 隱私模式 */ }

        if (String(postId).startsWith('local_')) { toast.success('已更新'); return true; }

        try {
            const fd = new FormData();
            // ⚠️ 後端 PUT 的 user_id 是必填 —— 以前沒帶，每次都 422，編輯從來沒存進伺服器
            appendIdentity(fd, userId);
            const clear = [];
            if ('caption' in patch) fd.append('caption', patch.caption ?? '');
            ['title', 'location'].forEach((k) => {
                if (!(k in patch)) return;
                const v = String(patch[k] ?? '').trim();
                if (v) fd.append(k, v); else clear.push(k);   // 表單空字串後端讀不到 → 明講要清空
            });
            if ('tags' in patch) {
                if (patch.tags?.length) fd.append('tags', JSON.stringify(patch.tags)); else clear.push('tags');
            }
            if ('visibility' in patch) fd.append('privacy', patch.visibility || 'public');
            if ('communities' in patch) fd.append('communities', JSON.stringify(patch.communities || []));
            if ('imgPos' in patch) fd.append('img_pos', String(patch.imgPos ?? 50));
            if (clear.length) fd.append('clear', JSON.stringify(clear));
            await api.put(`/api/activities/${postId}`, fd);
            toast.success('已更新');
            return true;
        } catch {
            if (before) {
                const undo = {};
                keys.forEach((k) => { undo[k] = before[k]; });
                if ('communities' in patch) undo.targets = before.targets;
                setActivities(prev => prev.map(p => (p.id === postId ? { ...p, ...undo } : p)));
                try { updateSocialPost(postId, undo, userId); } catch { /* ok */ }
            }
            toast.error('修改沒有存到伺服器，已還原');
            return false;
        }
    }, [userId]);   // eslint-disable-line react-hooks/exhaustive-deps

    // 留言送出後父層的留言數 +1
    const bumpCommentCount = useCallback((postId) => {
        setActivities(prev => prev.map(p => (p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p)));
    }, []);

    // ── 過濾 ────────────────────────────────────────────────────────────
    /* 社群歸屬：貼文只出現在作者勾選的社群。
       舊貼文沒有 targets → 兩邊都出現，歷史內容不會憑空消失。 */
    const belongsHere = useCallback((a) => {
        const t = a.targets || a.communities;
        if (!Array.isArray(t) || t.length === 0) return true;
        return t.includes(community);
    }, [community]);

    /* 可見度：公開 / 粉絲 / 僅好友。自己的貼文永遠看得到。 */
    const canSee = useCallback((a) => {
        const authorId = a.uId || a.user_id;
        if (authorId === userId || authorId === getUserId()) return true;
        const v = a.visibility || 'public';
        if (v === 'public') return true;
        if (v === 'friends') return (graph?.friends || []).includes(authorId);
        return following.includes(authorId) || (graph?.friends || []).includes(authorId);
    }, [userId, graph, following]);

    const filtered = useMemo(() => {
        const visible = activities.filter(a =>
            belongsHere(a) && canSee(a) && (extraVisibleFilter ? extraVisibleFilter(a) : true)
        );
        const isMine = (a) => {
            const authorId = a.uId || a.user_id;
            return authorId === userId || authorId === getUserId() || String(a.id || '').startsWith('local_');
        };
        return feedFilter === 'following'
            ? visible.filter(a => following.includes(a.uId) || isMine(a))
            // 探索：沒追蹤的人 + 自己剛發的（否則自己發文在探索分頁會看不到）
            : visible.filter(a => !following.includes(a.uId) || isMine(a));
    }, [activities, feedFilter, following, belongsHere, canSee, extraVisibleFilter, userId]);

    return {
        activities, setActivities, filtered,
        loading, feedError,
        feedFilter, setFeedFilter,
        following, setFollowing, graph, counts,
        commentPostId, setCommentPostId,
        kudoersPostId, setKudoersPostId,
        editingPost, setEditingPost,
        showCreate, setShowCreate,
        handleNewPost, handleKudo, handleDelete, handleEdit, saveEdit, bumpCommentCount,
    };
}

export default useCommunityFeed;
