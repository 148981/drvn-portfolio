import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { Send, Trash2 } from 'lucide-react';
import { confirmDialog } from '../utils/toast';

import apiClient from '../api/client';

const CommentSection = ({ activityId, currentUserId }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchComments();
    }, [activityId]);

    const fetchComments = async () => {
        try {
            const response = await apiClient.get(`/api/activities/${activityId}/comments`);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Failed to load comments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePostComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        const content = newComment.trim();
        setNewComment('');
        setIsSubmitting(true);

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const tempComment = {
            comment_id: tempId,
            user_id: currentUserId,
            user_name: 'Me', // Should fetch user profile
            content: content,
            created_at: new Date().toISOString(),
            isTemp: true
        };

        setComments(prev => [...prev, tempComment]);

        try {
            const formData = new FormData();
            formData.append('user_id', currentUserId);
            formData.append('user_name', 'Me');
            formData.append('content', content);

            await apiClient.post(`/api/activities/${activityId}/comments`, formData);
            // Re-fetch to get real ID and server timestamp
            fetchComments();

            // Trigger challenge update if provided
            if (window.onInteraction) window.onInteraction('comment');
        } catch (error) {
            console.error('Failed to post comment:', error);
            // Remove temp if failed
            setComments(prev => prev.filter(c => c.comment_id !== tempId));
            setNewComment(content); // Restore text
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (commentId) => {
        if (!(await confirmDialog('Delete this comment?', { danger: true }))) return;

        setComments(prev => prev.filter(c => c.comment_id !== commentId));

        try {
            await apiClient.delete(`/api/social/comments/${commentId}`, {
                params: { user_id: currentUserId }
            });
        } catch (error) {
            console.error('Failed to delete comment:', error);
            fetchComments(); // Revert on failure
        }
    };

    if (loading) return <div className="p-4 text-center text-xs text-stone-400">Loading comments...</div>;

    return (
        <div className="p-4 bg-[#F9F7F2]">
            {/* Comment List */}
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {comments.length === 0 ? (
                    <p className="text-center text-xs text-stone-400 italic py-2">No comments yet. Say something nice! 👋</p>
                ) : (
                    comments.map(comment => (
                        <div key={comment.comment_id} className={`flex gap-3 ${comment.isTemp ? 'opacity-50' : ''}`}>
                            <div className="w-8 h-8 rounded-full bg-[#E8DCC6] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-[#8B7F72]">
                                {comment.user_name.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="bg-white p-2 px-3 rounded-[18px] rounded-tl-none border border-[#E8DCC6] inline-block max-w-full">
                                    <p className="text-xs font-bold text-[#4A3F35] mb-0.5">{comment.user_name}</p>
                                    <p className="text-sm text-[#4A3F35] leading-snug break-words">{comment.content}</p>
                                </div>
                                <div className="flex items-center gap-2 mt-1 ml-1">
                                    <span className="text-[11px] text-[#8B7F72]">
                                        {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {/* Delete Button (Only for own comments) */}
                                    {/* Mock logic: assume 'user_123' is Me or simple check */}
                                    {(comment.user_id === currentUserId || comment.user_name === 'Me') && (
                                        <motion.button {...pressProps('row')}
 onClick={() => handleDelete(comment.comment_id)}
 className="text-[11px] text-red-400 hover:text-red-600 font-medium"
 >
                                            Delete
                                        </motion.button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Input Form */}
            <form onSubmit={handlePostComment} className="relative flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#161415] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white">
                    Me
                </div>
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 bg-white border-2 border-[#E4DED2] rounded-full px-4 py-2 text-sm text-[#161415] placeholder:text-[#5A5A5A] focus:outline-none focus:border-[#F95C4B] focus:ring-2 focus:ring-[#F95C4B]/20 transition-all"
                    disabled={isSubmitting}
                />
                <motion.button {...pressProps('icon')} aria-label="送出"
 type="submit"
 disabled={!newComment.trim() || isSubmitting}
 className="p-2 text-[#F95C4B] disabled:opacity-30 hover:bg-[#F6F4F1] rounded-full transition-colors"
 >
                    <Send size={18} />
                </motion.button>
            </form>
        </div>
    );
};

export default CommentSection;
