const Post = require('../models').Posts;
const User = require('../models').Users;
const Rating = require('../models').Ratings;

const auth = require('../middleware/auth')
const {getStreamClient} = require('../util/stream')

const express = require('express')
const router = new express.Router()

router.get('/feed/home-feed', auth, async (req,res) =>{
    const limit = req.query.per_page || 30;
    const offset = req.query.page * limit || 0;
    const last_activity_id = req.query.last_activity_id;
    let response;
    try{
        if(last_activity_id){
            response = await getStreamClient().feed('timeline', req.user.id).get({limit, id_gt: last_activity_id})
        }else{
            response = await getStreamClient().feed('timeline', req.user.id).get({limit,offset})
        }   
        let postIDs = response.results.map((r) => {
            return parseInt(r.foreign_id.split(':')[1]);
        });

        let posts = await Post.findAll({
            where: {id: postIDs},
            include: [
                {
                    model: User,
                    as: 'owner',
                    attributes: ['username', 'name', 'id', 'avatarUrl']
                },
                {
                    model: User,
                    as: 'repinnedFrom',
                    attributes: ['username', 'id'] 
                }
            ]
        });
        let postLookup = {};

        for (let p of posts) {
            postLookup[p.id] = p;
        }

        let sortedposts = [];

        for (let r of response.results) {
            let postID = r.foreign_id.split(':')[1];
            let post = postLookup[postID];

            if (!post) {
                // log errors later on
                continue;
            }

            //sortedposts.push(post);
            let rating = await Rating.findOne({where: {UserId: req.user.id, PostId: post.id}})
            sortedposts.push({
                ...post.serializePost(),
                owner: {
                    username: post.owner.username,
                    name: post.owner.name,
                    id: post.owner.id,
                    avatarUrl: post.owner.avatarUrl
                },
                repinnedFrom: {
                    username: post.repinnedFrom.username,
                    id: post.repinnedFrom.id,
                },
                rating: rating ? rating.rating : null
            })
        }
        res.json({
            posts: sortedposts, 
            last_activity_id: response.results[0] ? response.results[0].id : null
        });
        }catch(e){
            console.log(e)
            res.status(400).send('could not fetch feed')
        }
    
})

router.get('/feed/profile-feed', auth, async (req,res) => {
    const limit = req.query.per_page || 30;
    const offset = req.query.page * limit || 0;

    try{
        const posts = await Post.findAll({
            where: {ownerId: req.query.id},
            limit: limit,
            offset: offset,
            order: [['createdAt', 'DESC']],
            include: {
                model: User,
                as: 'repinnedFrom',
                attributes: ['username', 'id'] 
            }
        });
        //res.send(posts)
        let list = [];
        for(i in posts){
            let rating = await Rating.findOne({where: {UserId: req.query.id, PostId: posts[i].id}})
            const serialized_post = posts[i].serializePost()
            list.push({...serialized_post,rating: rating ? rating.rating : null})
        }
        res.send(list);
    }catch(e){
        console.log(e)
        res.status(400).send('could not fetch posts')
    }    
});

module.exports = router