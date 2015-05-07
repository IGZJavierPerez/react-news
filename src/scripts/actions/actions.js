'use strict';

var Reflux = require('reflux');
var Firebase = require('firebase');
var config = require('../../util/config');

var $ = require('jquery');

var ref = new Firebase(config.db.firebase);
var commentsRef = ref.child('comments'),
    postsRef = ref.child('posts'),
    usersRef = ref.child('users');

// used to create email hash for gravatar
var hash = require('crypto').createHash('md5');

var actions = Reflux.createActions({
    // user actions
    'login': {},
    'logout': { asyncResult: true },
    'register': {},
    'createProfile': {},
    'updateProfile': {},
    // post actions
    'upvotePost': {},
    'downvotePost': {},
    'submitPost': {},
    'deletePost': {},
    'setSortBy': {},
    // comment actions
    'upvoteComment': {},
    'downvoteComment': {},
    'updateCommentCount': {},
    'addComment': {},
    'deleteComment': {},
    // firebase actions
    'listenToProfile': {},
    'listenToPost': {},
    'listenToPosts': {},
    'stopListeningToProfile': {},
    'stopListeningToPosts': {},
    'stopListeningToPost': {},
    // error actions
    'loginError': {},
    'postError': {},
    // ui actions
    'showOverlay': {},
    'goToPost': {}
});


/* User Actions
===============================*/

actions.register.listen(function(username, loginData) {

    function checkForUsername(name) {
        // checks if username is taken
        var defer = $.Deferred();
        usersRef.orderByChild('username').equalTo(name).once('value', function(user) {
            defer.resolve(!!user.val());
        });
        return defer.promise();
    }

    if (!username) {
        // no username provided
        actions.loginError('NO_USERNAME');
    } else {
        // check if username is already taken
        checkForUsername(username).then(function(usernameTaken) {
            if (usernameTaken) {
                actions.loginError('USERNAME_TAKEN');
            } else {
                ref.createUser(loginData, function(error) {
                    if (error) {
                        // error during user creation
                        actions.loginError(error.code);
                    } else {
                        // user successfully created
                        actions.login(loginData, username);
                    }
                });
            }
        });
    }
});

actions.login.listen(function(user, username) {
    // username only provided when registering a new user
    // used to create a user profile
    ref.authWithPassword(user, function(error, authData) {
        if (error !== null) {
            actions.loginError(error.code);
        } else {
            // sucessful login
            var userId = authData.uid;
            if (username) {
                // new user logging in for first time
                var email = authData.password.email;
                actions.createProfile(userId, username, email);
            } else {
            }
        } 
    });
});

actions.createProfile.listen(function(uid, username, email) {
    var md5hash = hash.update(email).digest('hex');
    var profile = {
        username: username,
        md5hash: md5hash,
        upvoted: {}
    };
    usersRef.child(uid).set(profile, function(error) {
        if (error === null) {
            // user profile successfully created
            actions.updateProfile(uid, profile);
        } else {
            actions.loginError(error.code);
        }
    });
});

// triggered by auth changes
ref.onAuth(function(authData) {
    if (!authData) {
        // logging out
        usersRef.off();
        actions.logout.completed();
    } else {
        // returning user
        var userId = authData.uid;
        usersRef.child(userId).on('value', function(profile) {
            actions.updateProfile(userId, profile.val());
        });
    }
});

actions.logout.listen(function() {
    // because of firebase API, callback must
    // be declared via ref.onAuth() (see above)
    ref.unauth();
});

/* Post Actions
===============================*/

actions.submitPost.preEmit = function(post) {
    var newPostRef = postsRef.push(post, function(error) {
        if (error !== null) {
            actions.postError(error.code);
        } else {
            actions.goToPost(newPostRef.key());
        }
    });
};

actions.deletePost.preEmit = function(postId) {
    postsRef.child(postId).remove();
    commentsRef.orderByChild('postId')
    .startAt(postId)
    .endAt(postId)
    .once('value', function(comments) {
        comments.forEach(function(comment) {
            comment.ref().remove()
        })
    });
};

/* Comment Actions
===============================*/

actions.updateCommentCount.preEmit = function(postId, n) {
    // updates comment count on post
    postsRef.child(postId).child('commentCount').transaction(function(curr) {
        return curr + n;
    });
};

actions.addComment.preEmit = function(comment) {
    commentsRef.push(comment, function(error) {
        if (error === null) {
            actions.updateCommentCount(comment.postId, 1);
        }
    });
};

actions.deleteComment.preEmit = function(commentId, postId) {
    commentsRef.child(commentId).remove(function(error) {
        if (error === null) {
            actions.updateCommentCount(postId, -1);
        }
    });
};


module.exports = actions;