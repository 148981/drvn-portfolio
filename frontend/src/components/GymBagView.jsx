import React, { useState, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion } from 'framer-motion';
import { ChevronLeft, Plus, Bookmark, Footprints, Trash2, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GymBagCard from './GymBagCard';
import { getShoes, addNewShoe, saveShoes } from '../utils/shoeManager';
import { toast } from '../utils/toast';

// Sample Gym Bag Feed Data
const SAMPLE_FEED = [
    {
        id: 'post-1',
        user: { name: 'Jessica Chen', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop',
        description: 'Sunday lifting essentials. Loving this new belt! #Powerlifting #SBD',
        likes: 124,
        isSaved: false,
        tags: [
            { id: 't1', x: 50, y: 50, brand: 'Nike', product: 'Metcon 8', link: '#' },
            { id: 't2', x: 30, y: 30, brand: 'SBD', product: 'Weight Belt', link: '#' },
            { id: 't2a', x: 70, y: 60, brand: 'Eleiko', product: 'Knee Sleeves', link: '#' }
        ]
    },
    {
        id: 'post-2',
        user: { name: 'Alex Wu', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&auto=format&fit=crop',
        description: 'Post-work yoga session gear. Minimal and functional for deep stretches. 🧘‍♂️',
        likes: 89,
        isSaved: true,
        tags: [
            { id: 't3', x: 60, y: 40, brand: 'Lululemon', product: 'The Mat 5mm', link: '#' },
            { id: 't4', x: 40, y: 70, brand: 'HydroFlask', product: '32oz Wide Mouth', link: '#' },
            { id: 't5', x: 20, y: 20, brand: 'Manduka', product: 'Cork Block', link: '#' }
        ]
    },
    {
        id: 'post-3',
        user: { name: 'Sarah Miller', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1556817411-31ae72fa3ea0?w=800&auto=format&fit=crop',
        description: 'Morning run setup. Testing out the new Garmin today! 🏃‍♀️💨 #MarathonTraining',
        likes: 245,
        isSaved: false,
        tags: [
            { id: 't6', x: 45, y: 45, brand: 'Hoka', product: 'Clifton 9', link: '#' },
            { id: 't7', x: 25, y: 65, brand: 'Garmin', product: 'Forerunner 265', link: '#' },
            { id: 't8', x: 75, y: 30, brand: 'Oakley', product: 'Sutro Lite', link: '#' }
        ]
    },
    {
        id: 'post-4',
        user: { name: 'David Kim', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=800&auto=format&fit=crop',
        description: 'Crossfit Open ready. Tape, grips, and adrenaline. Let’s go! 🔥',
        likes: 156,
        isSaved: false,
        tags: [
            { id: 't9', x: 30, y: 50, brand: 'Bear Komplex', product: 'Carbon Grips', link: '#' },
            { id: 't10', x: 60, y: 40, brand: 'Reebok', product: 'Nano X3', link: '#' },
            { id: 't11', x: 50, y: 80, brand: 'Rogue', product: 'Wrist Wraps', link: '#' }
        ]
    },
    {
        id: 'post-5',
        user: { name: 'Emma Wilson', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800&auto=format&fit=crop',
        description: 'Recovery day essentials. Foam rolling and protein shake time. 💆‍♀️',
        likes: 312,
        isSaved: true,
        tags: [
            { id: 't12', x: 50, y: 40, brand: 'Theragun', product: 'Mini 2.0', link: '#' },
            { id: 't13', x: 30, y: 70, brand: 'Optimum Nutrition', product: 'Gold Standard Whey', link: '#' },
            { id: 't14', x: 70, y: 60, brand: 'TriggerPoint', product: 'GRID Roller', link: '#' }
        ]
    },
    {
        id: 'post-6',
        user: { name: 'Tom Hardy', avatar: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=150&auto=format&fit=crop&q=60' },
        imageUrl: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?w=800&auto=format&fit=crop',
        description: 'Boxing gym loadout. Gloves on, world off. 🥊',
        likes: 189,
        isSaved: false,
        tags: [
            { id: 't15', x: 40, y: 50, brand: 'Hayabusa', product: 'T3 Boxing Gloves', link: '#' },
            { id: 't16', x: 70, y: 40, brand: 'Everlast', product: 'Hand Wraps', link: '#' },
            { id: 't17', x: 20, y: 70, brand: 'Nike', product: 'HyperKO 2', link: '#' }
        ]
    }
];

const GymBagView = () => {
    const navigate = useNavigate();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('feed'); // 'feed' | 'saved' | 'gear'
    const [myShoes, setMyShoes] = useState([]);
    const [showAddShoeModal, setShowAddShoeModal] = useState(false);
    const [newShoe, setNewShoe] = useState({ brand: '', model: '', maxMileage: 800 });

    useEffect(() => {
        // Simulation of API fetch
        setTimeout(() => {
            setPosts(SAMPLE_FEED);
            setLoading(false);
        }, 500);

        // Load user's shoes
        const shoes = getShoes();
        setMyShoes(shoes);
    }, []);;

    const handleToggleSave = (postId) => {
        setPosts(prevPosts => prevPosts.map(post =>
            post.id === postId ? { ...post, isSaved: !post.isSaved } : post
        ));
    };

    const handleUpload = () => {
        toast.info("上傳功能即將推出");
    };

    const displayedPosts = viewMode === 'saved'
        ? posts.filter(post => post.isSaved)
        : posts;

    return (
        <div className="min-h-[100dvh] bg-[#F6F4F1] pb-4">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[#F6F4F1]/95 backdrop-blur-sm border-b border-[#E5E5E5]">
                <div className="px-6 py-4">
                    <div className="flex items-center gap-4">
                        <motion.button {...pressProps('icon')}
 onClick={() => navigate(-1)}
 className="p-2 -ml-2 rounded-full hover:bg-black/5 transition-colors"
 >
                            <ChevronLeft size={24} className="text-[#262523]" />
                        </motion.button>
                        <div className="flex-1 text-center">
                            <h1 className="text-xl font-serif text-[#262523]">What's in my Gym Bag</h1>
                        </div>
                        <motion.button {...pressProps('icon')} aria-label="新增"
 onClick={handleUpload}
 className="p-2 -mr-2 rounded-full hover:bg-black/5 transition-colors"
 >
                            <Plus size={24} className="text-[#262523]" />
                        </motion.button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-6 mt-4 justify-center">
                        <motion.button {...pressProps('row')}
 onClick={() => setViewMode('feed')}
 className={`pb-2 text-sm font-semibold transition-colors relative ${viewMode === 'feed' ? 'text-[#262523]' : 'text-[#8B7F72]'
 }`}
 >
                            Following
                            {viewMode === 'feed' && (
                                <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#262523]" />
                            )}
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={() => setViewMode('saved')}
 className={`pb-2 text-sm font-semibold transition-colors relative ${viewMode === 'saved' ? 'text-[#262523]' : 'text-[#8B7F72]'
 }`}
 >
                            Saved Looks
                            {viewMode === 'saved' && (
                                <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#262523]" />
                            )}
                        </motion.button>
                        <motion.button {...pressProps('row')}
 onClick={() => setViewMode('gear')}
 className={`pb-2 text-sm font-semibold transition-colors relative flex items-center gap-1 ${viewMode === 'gear' ? 'text-[#262523]' : 'text-[#8B7F72]'
 }`}
 >
                            <Footprints size={16} />
                            My Gear
                            {viewMode === 'gear' && (
                                <motion.div layoutId="underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#262523]" />
                            )}
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Feed Grid */}
            <div className="px-4 py-6">
                {viewMode === 'gear' ? (
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-[#262523]">Running Shoes</h2>
                            <motion.button {...pressProps('row')}
 onClick={() => setShowAddShoeModal(true)}
 className="px-4 py-2 bg-[#8FA395] text-white rounded-xl text-sm font-semibold"
 >
                                + Add Shoe
                            </motion.button>
                        </div>

                        <div className="grid gap-4">
                            {myShoes.map((shoe) => (
                                <div key={shoe.id} className="bg-white p-6 rounded-[18px] shadow-sm">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-2xl">👟</span>
                                                <div>
                                                    <h3 className="font-semibold text-[#262523]">{shoe.brand}</h3>
                                                    <p className="text-sm text-[#8B7F72]">{shoe.model}</p>
                                                </div>
                                            </div>
                                            <div className="mt-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs text-[#8B7F72]">Mileage</span>
                                                    <span className="text-xs font-semibold">{shoe.mileage} / {shoe.maxMileage} km</span>
                                                </div>
                                                <div className="h-2 bg-gray-200 rounded-full">
                                                    <div className="h-full bg-[#8FA395] rounded-full" style={{ width: `${Math.min((shoe.mileage / shoe.maxMileage) * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                        <motion.button {...pressProps('row')} onClick={() => { const updated = myShoes.filter(s => s.id !== shoe.id); setMyShoes(updated); saveShoes(updated); }} className="p-2"><Trash2 size={18} className="text-[#8B7F72]" /></motion.button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {showAddShoeModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50">
                                <div className="bg-white rounded-[18px] p-6 w-full max-w-md">
                                    <h3 className="text-xl font-semibold mb-4">Add New Shoe</h3>
                                    <div className="space-y-4">
                                        <input type="text" value={newShoe.brand} onChange={(e) => setNewShoe({ ...newShoe, brand: e.target.value })} className="w-full px-4 py-2 border rounded-xl" placeholder="Brand" />
                                        <input type="text" value={newShoe.model} onChange={(e) => setNewShoe({ ...newShoe, model: e.target.value })} className="w-full px-4 py-2 border rounded-xl" placeholder="Model" />
                                        <input type="number" value={newShoe.maxMileage} onChange={(e) => setNewShoe({ ...newShoe, maxMileage: parseInt(e.target.value) })} className="w-full px-4 py-2 border rounded-xl" />
                                    </div>
                                    <div className="flex gap-3 mt-6">
                                        <motion.button {...pressProps('cta')} onClick={() => { setShowAddShoeModal(false); setNewShoe({ brand: '', model: '', maxMileage: 800 }); }} className="flex-1 py-3 border rounded-xl">Cancel</motion.button>
                                        <motion.button {...pressProps('cta')} onClick={() => { if (newShoe.brand && newShoe.model) { const added = addNewShoe(newShoe); setMyShoes([...myShoes, added]); setShowAddShoeModal(false); setNewShoe({ brand: '', model: '', maxMileage: 800 }); } }} className="flex-1 py-3 bg-[#8FA395] text-white rounded-xl">Add</motion.button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : loading ? (
                    <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="aspect-[4/5] rounded-3xl ti-skeleton" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {displayedPosts.length > 0 ? (
                            displayedPosts.map((post) => (
                                <GymBagCard
                                    key={post.id}
                                    post={post}
                                    onToggleSave={handleToggleSave}
                                />
                            ))
                        ) : (
                            <div className="col-span-full py-12 text-center text-[#8B7F72]">
                                {viewMode === 'saved' ? 'No saved looks yet' : 'No posts found'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating Info */}
            <div className="fixed bottom-6 right-6 z-10">
                <div className="bg-[#262523] text-white px-4 py-2 rounded-full shadow-lg text-xs font-medium flex items-center gap-2">
                    <Bookmark size={14} className="fill-white" />
                    <span>Tap photos to see tags</span>
                </div>
            </div>
        </div>
    );
};

export default GymBagView;
