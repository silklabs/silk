#!/usr/bin/env coffee

# clear terminal
process.stdout.write '\u001B[2J\u001B[0;0f'


slumber = require '..'

# Connect to http://slumber.in/api/v1/ with the Basic Auth user/password of demo/demo
api = slumber.API 'http://slumber.in/api/v1/', { auth: ['demo', 'demo'] }, ->

  # GET http://slumber.in/api/v1/note/
  #     Note: Any kwargs passed to get(), post(), put(), delete() will be used as url parameters
  api('note').get()

  # POST http://slumber.in/api/v1/note/
  new_post = api('note').post({'title': 'My Test Note', 'content': 'This is the content of my Test Note!'})

  console.log new_post

  return

  # PUT http://slumber.in/api/v1/note/{id}/
  api('note')(new_post['id']).put({'content': 'I just changed the content of my Test Note!'})

  # PATCH http://slumber.in/api/v1/note/{id}/
  api('note')(new_post['id']).patch({'content': 'Wat!'})

  # GET http://slumber.in/api/v1/note/{id}/
  api('note')(new_post['id']).get()

  # DELETE http://slumber.in/api/v1/note/{id}/
  api('note')(new_post['id']).delete()

  api('resource').get {username: "example", api_key: "1639eb74e86717f410c640d2712557aac0e989c8"}

  # GET http://slumber.in/api/v1/note/?title__startswith=Bacon
  api('note').get(title__startswith="Bacon")
