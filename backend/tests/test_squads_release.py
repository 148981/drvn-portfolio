"""Release regression: real routes, isolated database, no production writes."""
import os
import tempfile
os.environ['DATABASE_URL'] = 'sqlite:///' + tempfile.mktemp(prefix='drvn-squads-', suffix='.db')
from fastapi import FastAPI
from fastapi.testclient import TestClient
import api_squads as api
api._migrate_json_to_db_once = lambda: None
app = FastAPI()
@app.middleware('http')
async def identity(request, call_next):
    request.state.user_id = request.headers.get('x-test-user')
    return await call_next(request)
app.include_router(api.router)
client = TestClient(app)

def req(method, path, uid='owner', **kw):
    return client.request(method, '/api/squads'+path, headers={'x-test-user':uid}, **kw)

def test_release_flow():
    assert client.get('/api/squads/').status_code == 401
    assert req('POST','/create',json={'name':'test','creator_id':'victim','creator_name':'V'}).status_code == 403
    r=req('POST','/create',json={'name':'test','creator_id':'owner','creator_name':'Owner'})
    assert r.status_code==200,r.text
    sid=r.json()['squad']['id']
    assert 'member_list' not in req('GET','/'+sid,uid='other').json()['squad']
    assert req('GET',f'/{sid}/activity',uid='other').status_code==403
    assert req('POST',f'/{sid}/join',uid='other',json={'user_id':'other','user_name':'Other'}).status_code==200
    assert req('POST',f'/{sid}/reject',uid='other',json={'operator_id':'other','target_user_id':'x'}).status_code==403
    post=req('POST',f'/{sid}/discussion',json={'action':'post','client_id':'one','text':'hello'})
    assert post.status_code==200,post.text
    msg=post.json()['chat'][0]['id']
    assert req('POST',f'/{sid}/discussion',json={'action':'post','client_id':'one','text':'hello'}).json()['chat'].__len__()==1
    assert len(req('GET',f'/{sid}/discussion',uid='other').json()['chat'])==1
    assert req('POST',f'/{sid}/discussion',uid='other',json={'action':'delete','message_id':msg}).status_code==403
    assert req('POST',f'/{sid}/discussion',uid='other',json={'action':'reply','message_id':msg,'text':'reply'}).status_code==200
    assert req('PATCH',f'/{sid}/role',json={'operator_id':'owner','payload':{'target_user_id':'other','new_role':'leader'}}).status_code==200
    squad=req('GET','/'+sid).json()['squad']
    assert squad['leader_id']=='other'
    assert len([m for m in squad['member_list'] if m['role']=='leader'])==1
    assert req('POST',f'/{sid}/leave',json={'user_id':'owner'}).status_code==200
    assert req('GET','/mine?user_id=owner').json()['squads']==[]
    assert req('GET',f'/{sid}/discussion').status_code==403
